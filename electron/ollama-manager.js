// Ollama engine lifecycle for the packaged Electron app — ported from Arcadia's
// Rust core. Goal: the AI "just works" without the user installing/running
// Ollama by hand.
//
//   1. ATTACH  — if a healthy Ollama is already on :11434 (a user install),
//                use it. We never duplicate the user's engine.
//   2. SPAWN   — else, if an `ollama` binary exists anywhere we know, run
//                `ollama serve` on a private port (:11435) as a child that dies
//                with the app.
//   3. INSTALL — else, report "needs-install"; the app can download the
//                standalone binary into userData/bin on demand.
//
// All loopback-only; no bundling (keeps the .dmg small).

const path = require("node:path");
const fs = require("node:fs");
const { spawn, execFile } = require("node:child_process");

const ATTACH_PORT = 11434;
const MANAGED_PORT = 11435;

// Pin the managed engine to a known-good release rather than "latest", so a
// fresh install is reproducible and can't be broken by an upstream change.
// Bump deliberately after testing. Override at runtime with OLLAMA_PIN if needed.
const OLLAMA_PIN = process.env.OLLAMA_PIN || "v0.30.10";
const DOWNLOAD_URL = `https://github.com/ollama/ollama/releases/download/${OLLAMA_PIN}/ollama-darwin.tgz`;

let child = null;

const endpoint = (port) => `http://127.0.0.1:${port}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function probeVersion(ep) {
  try {
    const res = await fetch(`${ep}/api/version`, {
      signal: AbortSignal.timeout(1000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.version || "unknown";
  } catch {
    return null;
  }
}

/** Candidate binary locations, most-preferred first. Absolute paths matter: a
 *  packaged .app inherits launchd's minimal PATH, not the shell's. */
function binaryCandidates(userData) {
  const out = [];
  for (const dir of (process.env.PATH || "").split(path.delimiter)) {
    if (dir) out.push(path.join(dir, "ollama"));
  }
  out.push(
    "/opt/homebrew/bin/ollama",
    "/usr/local/bin/ollama",
    "/Applications/Ollama.app/Contents/Resources/ollama",
    path.join(userData, "bin", "ollama-dist", "ollama"),
    path.join(userData, "bin", "ollama"),
  );
  return out;
}

function findBinary(userData) {
  return binaryCandidates(userData).find((p) => {
    try {
      return fs.statSync(p).isFile();
    } catch {
      return false;
    }
  });
}

/** Current engine state without changing anything. */
async function status(userData) {
  const attach = endpoint(ATTACH_PORT);
  let version = await probeVersion(attach);
  if (version) return { state: "running", endpoint: attach, managed: false, version };

  const managed = endpoint(MANAGED_PORT);
  version = await probeVersion(managed);
  if (version)
    return { state: "running", endpoint: managed, managed: !!child, version };

  const hasBinary = !!findBinary(userData);
  return {
    state: hasBinary ? "stopped" : "needs-install",
    endpoint: attach,
    managed: false,
    version: null,
  };
}

/** Attach if possible, else spawn a managed engine. Returns the endpoint to use. */
async function ensureRunning(userData, logDir) {
  const cur = await status(userData);
  if (cur.state === "running") return cur;
  if (cur.state === "needs-install") return cur;

  const bin = findBinary(userData);
  if (!bin) {
    return { state: "needs-install", endpoint: endpoint(ATTACH_PORT), managed: false, version: null };
  }

  try {
    fs.mkdirSync(logDir, { recursive: true });
    const out = fs.openSync(path.join(logDir, "ollama.log"), "a");
    child = spawn(bin, ["serve"], {
      env: {
        ...process.env,
        OLLAMA_HOST: `127.0.0.1:${MANAGED_PORT}`,
        // The webview origin must pass CORS on our own instance.
        OLLAMA_ORIGINS: "*",
      },
      stdio: ["ignore", out, out],
    });
    child.on("exit", () => {
      child = null;
    });
  } catch (err) {
    return {
      state: "error",
      endpoint: endpoint(MANAGED_PORT),
      managed: false,
      version: null,
      error: String((err && err.message) || err),
    };
  }

  const managed = endpoint(MANAGED_PORT);
  for (let i = 0; i < 60; i++) {
    const version = await probeVersion(managed);
    if (version) return { state: "running", endpoint: managed, managed: true, version };
    await sleep(500);
  }
  shutdown();
  return {
    state: "error",
    endpoint: managed,
    managed: false,
    version: null,
    error: "ollama serve did not become healthy within 30s (see ollama.log)",
  };
}

function execFileP(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, (err, stdout) => (err ? reject(err) : resolve(stdout)));
  });
}

/** Find the `ollama` executable inside an extracted release dir (shallow walk). */
function findOllamaExe(dir) {
  const direct = path.join(dir, "ollama");
  try {
    if (fs.statSync(direct).isFile()) return direct;
  } catch {
    /* keep looking */
  }
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    try {
      const st = fs.statSync(p);
      if (st.isFile() && name === "ollama") return p;
      if (st.isDirectory()) {
        const nested = path.join(p, "ollama");
        if (fs.existsSync(nested)) return nested;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** Download + extract the standalone ollama binary into userData/bin. */
async function install(userData, onProgress) {
  const binDir = path.join(userData, "bin");
  fs.mkdirSync(binDir, { recursive: true });
  const tgz = path.join(binDir, "ollama.tgz.partial");

  const res = await fetch(DOWNLOAD_URL);
  if (!res.ok || !res.body) throw new Error(`engine download failed: HTTP ${res.status}`);
  const total = Number(res.headers.get("content-length")) || null;
  let downloaded = 0;

  const fileStream = fs.createWriteStream(tgz);
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    fileStream.write(Buffer.from(value));
    downloaded += value.length;
    if (onProgress) onProgress({ downloaded, total });
  }
  await new Promise((resolve) => fileStream.end(resolve));

  const distDir = path.join(binDir, "ollama-dist");
  fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(distDir, { recursive: true });
  // macOS ships bsdtar; handles .tgz with the full runner layout.
  await execFileP("tar", ["-xzf", tgz, "-C", distDir]);
  fs.rmSync(tgz, { force: true });

  const bin = findOllamaExe(distDir);
  if (!bin) throw new Error("no `ollama` binary found in the downloaded archive");
  fs.chmodSync(bin, 0o755);
  return bin;
}

function shutdown() {
  if (child) {
    try {
      child.kill();
    } catch {
      /* ignore */
    }
    child = null;
  }
}

module.exports = { status, ensureRunning, install, shutdown, ATTACH_PORT, MANAGED_PORT };
