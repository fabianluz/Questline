// Preload: expose a tiny, safe bridge to the renderer (context-isolated).
// `window.questline.openIcs(ics, filename)` writes a temp .ics and opens it in
// the OS default calendar app (Apple Calendar) so "Take to Calendar" is one
// click in the desktop build. On the web there is no bridge and the app falls
// back to a normal .ics download.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("questline", {
  openIcs: (ics, filename) =>
    ipcRenderer.invoke("questline:open-ics", { ics, filename }),

  // Native OS notification (reminders, daily digest). Used by the notification
  // scheduler in the desktop build — fires even when the window is hidden and
  // needs no browser permission prompt. No-op fallback on the web.
  notify: (title, body) =>
    ipcRenderer.invoke("questline:notify", { title, body }),

  // Reveal a file in Finder (used by the one-click backup so saved backups are
  // findable). Web build has no bridge → callers fall back to showing the path.
  revealPath: (p) => ipcRenderer.invoke("questline:reveal-path", p),

  // Local AI engine (Ollama) controls — present only in the desktop build, so
  // the Model Manager can detect packaged mode and offer in-app start/install.
  ollamaStatus: () => ipcRenderer.invoke("questline:ollama-status"),
  ollamaStart: () => ipcRenderer.invoke("questline:ollama-start"),
  ollamaInstall: () => ipcRenderer.invoke("questline:ollama-install"),
  /** Subscribe to download progress; returns an unsubscribe fn. */
  onOllamaProgress: (cb) => {
    const handler = (_e, p) => cb(p);
    ipcRenderer.on("questline:ollama-progress", handler);
    return () => ipcRenderer.removeListener("questline:ollama-progress", handler);
  },
});
