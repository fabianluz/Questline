// Local speech-to-text for voice journaling (Phase 6) — adapted from Arcadia's
// whisper.rs. Transcription runs entirely on-device via whisper.cpp's
// `whisper-cli`:
//
//   • BINARY  — `whisper-cli` is detected on PATH / Homebrew. We don't bundle a
//               native ML binary; the user installs it once: `brew install
//               whisper-cpp`. (Status reports when it's missing.)
//   • MODEL   — the ggml model is downloaded on demand into userData/whisper
//               (base ≈148 MB), so the .dmg stays small.
//
// The mic audio arrives already as a 16 kHz mono WAV (encoded in the renderer
// via WebAudio + lib/wav.ts), so — unlike Arcadia's video flow — no ffmpeg is
// needed here. All offline; nothing leaves the machine except the one-time
// model download.

const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFile } = require("node:child_process");

const MODEL = "base"; // multilingual (handles the user's ES/EN journaling)
const MODEL_URL = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${MODEL}.bin`;

/** Probe install dirs + PATH for a binary. A Finder-launched .app does NOT
 *  inherit the shell PATH, so Homebrew's bin must be checked explicitly. */
function findBin(names) {
  const dirs = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"];
  for (const d of (process.env.PATH || "").split(path.delimiter)) if (d) dirs.push(d);
  for (const d of dirs) {
    for (const n of names) {
      const p = path.join(d, n);
      try {
        if (fs.statSync(p).isFile()) return p;
      } catch {
        /* keep looking */
      }
    }
  }
  return null;
}

function modelPath(userData) {
  return path.join(userData, "whisper", `ggml-${MODEL}.bin`);
}

/** What's available for transcription right now. */
function status(userData) {
  const whisperBin = findBin(["whisper-cli", "whisper-cpp", "whisper", "main"]);
  const model = modelPath(userData);
  const hasModel = (() => {
    try {
      return fs.statSync(model).size > 0;
    } catch {
      return false;
    }
  })();
  const state = !whisperBin ? "needs-binary" : !hasModel ? "needs-model" : "ready";
  return { state, whisperBin, model: hasModel ? model : null };
}

/** Download the ggml model into userData/whisper, streaming progress. */
async function installModel(userData, onProgress) {
  const dir = path.join(userData, "whisper");
  fs.mkdirSync(dir, { recursive: true });
  const dest = modelPath(userData);
  const partial = `${dest}.partial`;

  const res = await fetch(MODEL_URL);
  if (!res.ok || !res.body) throw new Error(`model download failed: HTTP ${res.status}`);
  const total = Number(res.headers.get("content-length")) || null;
  let downloaded = 0;

  const stream = fs.createWriteStream(partial);
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    stream.write(Buffer.from(value));
    downloaded += value.length;
    if (onProgress) onProgress({ downloaded, total });
  }
  await new Promise((resolve) => stream.end(resolve));
  fs.renameSync(partial, dest); // atomic: a half-download never looks "ready"
  return dest;
}

function execFileP(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 1 << 24 }, (err, stdout) =>
      err ? reject(err) : resolve(stdout),
    );
  });
}

/**
 * Transcribe 16 kHz mono WAV bytes → plain text. Writes a temp WAV, runs
 * whisper-cli (-nt = no timestamps), joins the non-empty output lines, cleans
 * up. `lang` is a Whisper code ("en"/"es") or "auto".
 */
async function transcribe(userData, wavBytes, lang = "auto") {
  const st = status(userData);
  if (st.state !== "ready") {
    throw new Error(
      st.state === "needs-binary"
        ? "whisper-cli not found — install it once with: brew install whisper-cpp"
        : "speech model not downloaded yet",
    );
  }
  const tmp = path.join(
    os.tmpdir(),
    `questline-stt-${process.pid}-${Date.now()}.wav`,
  );
  fs.writeFileSync(tmp, Buffer.from(wavBytes));
  try {
    const stdout = await execFileP(st.whisperBin, [
      "-m", st.model,
      "-f", tmp,
      "-nt",
      "-l", lang || "auto",
    ]);
    return String(stdout)
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .join(" ")
      .trim();
  } finally {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* ignore */
    }
  }
}

module.exports = { status, installModel, transcribe, MODEL };
