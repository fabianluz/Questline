// Electron main process for Questline.
//
// Boots the bundled Next.js production server (the `.next/standalone` output)
// as an Electron-as-Node child process, pointed at an embedded PGlite database
// in the app's userData folder — no Docker, no external DB. Then opens a window
// on it. Ollama (for the AI features) stays an external local install; the app
// degrades gracefully when it isn't running.

const { app, BrowserWindow, Notification, shell, dialog, ipcMain } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const crypto = require("node:crypto");
const net = require("node:net");
const { fork, spawn } = require("node:child_process");
const ollama = require("./ollama-manager");
const whisper = require("./whisper-manager");

// Endpoint the forked Next server (lib/ollama) should talk to. Resolved at boot:
// the user's own Ollama on :11434 if present, else our managed engine on :11435.
let ollamaEndpoint = "http://127.0.0.1:11434";

// "Take to Calendar": write the day's .ics to a temp file and open it with the
// OS default handler (Apple Calendar shows an "Add events" sheet).
ipcMain.handle("questline:open-ics", async (_e, { ics, filename }) => {
  const safe = String(filename || "questline.ics").replace(/[^\w.-]/g, "_");
  const file = path.join(os.tmpdir(), safe);
  fs.writeFileSync(file, ics, "utf8");
  const err = await shell.openPath(file);
  if (err) throw new Error(err);
  return { opened: true };
});

// Show a native OS notification (reminders / daily digest). Fires even when the
// window is hidden. Safe no-op if the platform can't show notifications.
ipcMain.handle("questline:notify", (_e, { title, body }) => {
  if (!Notification.isSupported()) return { shown: false };
  const n = new Notification({ title: String(title ?? ""), body: String(body ?? "") });
  // Clicking the notification surfaces the app window.
  n.on("click", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
  n.show();
  return { shown: true };
});

// Reveal a saved file (e.g. a backup) in Finder.
ipcMain.handle("questline:reveal-path", (_e, p) => {
  if (typeof p === "string" && p) shell.showItemInFolder(p);
  return { ok: true };
});

// ── Voice: text-to-speech via macOS `say` (Phase 6) ─────────────────────────
// Built-in, offline, no bundling. One process at a time; text is piped on stdin
// to dodge arg-length/quoting limits (ported from Arcadia's tts.rs).
let sayChild = null;
function stopSpeaking() {
  if (sayChild) {
    try {
      sayChild.kill();
    } catch {
      /* ignore */
    }
    sayChild = null;
  }
}
ipcMain.handle("questline:speak", (_e, { text, voice, rate }) => {
  stopSpeaking();
  const t = String(text ?? "").trim();
  if (!t) return { speaking: false };
  const args = [];
  if (voice) args.push("-v", String(voice));
  if (rate) args.push("-r", String(rate));
  sayChild = spawn("/usr/bin/say", args, { stdio: ["pipe", "ignore", "ignore"] });
  sayChild.on("exit", () => {
    sayChild = null;
  });
  sayChild.stdin.write(t);
  sayChild.stdin.end(); // EOF → say starts speaking
  return { speaking: true };
});
ipcMain.handle("questline:stop-speaking", () => {
  stopSpeaking();
  return { speaking: false };
});

// ── Voice: local speech-to-text via whisper.cpp (Phase 6) ───────────────────
ipcMain.handle("questline:whisper-status", () => whisper.status(app.getPath("userData")));
ipcMain.handle("questline:whisper-install-model", async () => {
  await whisper.installModel(app.getPath("userData"), (p) => {
    mainWindow?.webContents.send("questline:whisper-progress", p);
  });
  return { installed: true };
});
ipcMain.handle("questline:transcribe", async (_e, { wav, lang }) =>
  whisper.transcribe(app.getPath("userData"), wav, lang),
);

const isDev = !app.isPackaged;
let serverProcess = null;
let mainWindow = null;
// True only during a real quit (Cmd+Q / app.quit). Until then, closing the
// window HIDES it on macOS so the renderer keeps polling and native reminders
// keep firing in the background.
let isQuitting = false;

function resolvePaths() {
  if (isDev) {
    const root = path.join(__dirname, "..");
    const standalone = path.join(root, ".next", "standalone");
    return {
      serverJs: path.join(standalone, "server.js"),
      serverCwd: standalone,
      migrationsDir: path.join(root, "drizzle"),
    };
  }
  // Packaged: extraResources are copied next to the app's Resources folder.
  const res = process.resourcesPath;
  const standalone = path.join(res, "standalone");
  return {
    serverJs: path.join(standalone, "server.js"),
    serverCwd: standalone,
    migrationsDir: path.join(res, "drizzle"),
  };
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

// A stable per-install auth secret so login sessions survive app restarts.
function getOrCreateSecret() {
  const file = path.join(app.getPath("userData"), "auth-secret");
  try {
    const existing = fs.readFileSync(file, "utf8").trim();
    if (existing.length >= 32) return existing;
  } catch {
    /* fall through to create */
  }
  const secret = crypto.randomBytes(32).toString("base64");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

function waitForServer(port, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const sock = net.connect(port, "127.0.0.1");
      sock.once("connect", () => {
        sock.destroy();
        resolve();
      });
      sock.once("error", () => {
        sock.destroy();
        if (Date.now() > deadline) reject(new Error("Server did not start in time"));
        else setTimeout(tryOnce, 200);
      });
    };
    tryOnce();
  });
}

async function startServer() {
  const { serverJs, serverCwd, migrationsDir } = resolvePaths();
  if (!fs.existsSync(serverJs)) {
    throw new Error(
      `Server bundle not found at ${serverJs}.\nRun \`pnpm app:prepare\` to build + stage it.`,
    );
  }
  const port = await getFreePort();
  const dataDir = path.join(app.getPath("userData"), "db");
  fs.mkdirSync(dataDir, { recursive: true });

  serverProcess = fork(serverJs, [], {
    cwd: serverCwd,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      QUESTLINE_EMBEDDED: "1",
      QUESTLINE_DATA_DIR: dataDir,
      QUESTLINE_MIGRATIONS_DIR: migrationsDir,
      BETTER_AUTH_SECRET: getOrCreateSecret(),
      BETTER_AUTH_URL: `http://127.0.0.1:${port}`,
      // Point the AI layer at the engine we resolved at boot (attached or
      // managed). Lets the in-app, auto-started Ollama be used transparently.
      OLLAMA_BASE_URL: ollamaEndpoint,
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  serverProcess.stdout?.on("data", (d) => console.log("[server]", d.toString().trim()));
  serverProcess.stderr?.on("data", (d) => console.error("[server]", d.toString().trim()));
  serverProcess.on("exit", (code) => {
    console.log("[server] exited with code", code);
    serverProcess = null;
  });

  await waitForServer(port);
  return port;
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: "#0a0f1f",
    title: "Questline",
    show: false,
    webPreferences: { preload: path.join(__dirname, "preload.js") },
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());
  // On macOS, the close button hides the window instead of destroying it, so
  // the renderer stays alive and keeps firing scheduled reminders. The dock
  // icon brings it back (see the `activate` handler); Cmd+Q truly quits.
  mainWindow.on("close", (e) => {
    if (!isQuitting && process.platform === "darwin") {
      e.preventDefault();
      mainWindow.hide();
    }
  });
  // External links open in the default browser; keep app navigation in-window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://127.0.0.1") || url.startsWith("http://localhost")) {
      return { action: "allow" };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });

  try {
    // Bring up the local AI engine first (attach to a user's Ollama, else spawn
    // our own from any installed binary) so the server forks with the right
    // endpoint. Never blocks startup: if nothing's installed, the app still
    // boots and Model Manager offers an in-app download.
    try {
      const engine = await ollama.ensureRunning(
        app.getPath("userData"),
        app.getPath("logs"),
      );
      if (engine && engine.endpoint && engine.state === "running") {
        ollamaEndpoint = engine.endpoint;
      }
      console.log("[ollama]", engine && engine.state, ollamaEndpoint);
    } catch (e) {
      console.error("[ollama] ensureRunning failed:", e);
    }

    const port = await startServer();
    await mainWindow.loadURL(`http://127.0.0.1:${port}/dashboard`);
  } catch (err) {
    dialog.showErrorBox(
      "Questline failed to start",
      String((err && err.message) || err),
    );
    app.quit();
  }
}

app.whenReady().then(createWindow);

app.on("activate", () => {
  // Re-show the hidden window (macOS dock click) rather than spawning a new one.
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  } else if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  isQuitting = true;
  stopSpeaking(); // don't leave a `say` process talking after quit
  if (serverProcess) {
    try {
      serverProcess.kill();
    } catch {
      /* ignore */
    }
  }
  // Take our managed Ollama down with us (a user's own engine is left alone).
  try {
    ollama.shutdown();
  } catch {
    /* ignore */
  }
});

// ── Ollama engine controls (exposed to the web UI via preload) ──────────────

/** Current engine state for the Model Manager banner. */
ipcMain.handle("questline:ollama-status", async () => {
  return ollama.status(app.getPath("userData"));
});

/**
 * Start/attach the engine on demand (binary already present). If the resolved
 * endpoint differs from what the running server was forked with, relaunch so
 * the server picks it up; otherwise just report status.
 */
ipcMain.handle("questline:ollama-start", async () => {
  const engine = await ollama.ensureRunning(
    app.getPath("userData"),
    app.getPath("logs"),
  );
  if (engine.state === "running" && engine.endpoint !== ollamaEndpoint) {
    ollamaEndpoint = engine.endpoint;
    app.relaunch();
    app.exit(0);
  }
  return engine;
});

/**
 * Download the standalone engine (~tens of MB), streaming progress to the
 * renderer, then relaunch so the freshly-installed binary is spawned + wired.
 */
ipcMain.handle("questline:ollama-install", async () => {
  await ollama.install(app.getPath("userData"), (p) => {
    mainWindow?.webContents.send("questline:ollama-progress", p);
  });
  app.relaunch();
  app.exit(0);
  return { installed: true };
});
