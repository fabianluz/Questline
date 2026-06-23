"use client";

import { useCallback, useEffect, useState } from "react";
import { Cpu, Download, Loader2, Power } from "lucide-react";

/**
 * Local AI Engine status + controls (Phase 5). Surfaces the self-managed Ollama
 * the desktop app runs for you: whether it's running (and whether Questline
 * manages it or it's attached to your own install), its version, or — if no
 * binary is found — a one-click download. Desktop-only: returns null on the web
 * build, where there is no `window.questline` bridge.
 *
 * The Electron main process (electron/ollama-manager.js) does the real work;
 * starting or installing relaunches the app so the bundled server is re-forked
 * pointed at the freshly-resolved engine endpoint.
 */

type EngineStatus = {
  state: "running" | "stopped" | "needs-install" | "error";
  endpoint: string;
  managed: boolean;
  version: string | null;
  error?: string;
};

type EngineBridge = {
  ollamaStatus: () => Promise<EngineStatus>;
  ollamaStart: () => Promise<unknown>;
  ollamaInstall: () => Promise<unknown>;
  onOllamaProgress: (
    cb: (p: { downloaded: number; total: number | null }) => void,
  ) => () => void;
};

function bridge(): EngineBridge | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { questline?: Partial<EngineBridge> };
  return w.questline?.ollamaStatus ? (w.questline as EngineBridge) : null;
}

const DOT: Record<EngineStatus["state"], string> = {
  running: "bg-trails-good",
  stopped: "bg-trails-warn",
  "needs-install": "bg-jrpg-gold",
  error: "bg-trails-bad",
};

export function EngineCard({ onChanged }: { onChanged?: () => void }) {
  const b = bridge();
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [busy, setBusy] = useState<"start" | "install" | null>(null);
  const [prog, setProg] = useState<{ downloaded: number; total: number | null } | null>(null);

  const refresh = useCallback(() => {
    b?.ollamaStatus().then(setStatus).catch(() => setStatus(null));
  }, [b]);

  useEffect(() => {
    if (!b) return;
    refresh();
    const off = b.onOllamaProgress((p) => setProg(p));
    return off;
  }, [b, refresh]);

  if (!b) return null; // web build — no managed engine

  const pct =
    prog?.total && prog.downloaded
      ? Math.round((prog.downloaded / prog.total) * 100)
      : null;

  const start = async () => {
    setBusy("start");
    try {
      await b.ollamaStart(); // relaunches if the endpoint changed
      refresh();
      onChanged?.();
    } finally {
      setBusy(null);
    }
  };
  const install = async () => {
    setBusy("install");
    try {
      await b.ollamaInstall(); // streams progress, then relaunches
    } finally {
      setBusy(null);
    }
  };

  const s = status?.state ?? "stopped";
  const label =
    s === "running"
      ? status?.managed
        ? "Running · managed by Questline"
        : "Running · using your Ollama"
      : s === "stopped"
        ? "Stopped"
        : s === "needs-install"
          ? "Not installed"
          : "Error";

  return (
    <section className="rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-trails-accent" />
          <h2 className="!m-0 !border-0 !p-0 font-display text-sm uppercase tracking-widest text-trails-accent">
            Local AI engine
          </h2>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-trails-fg-dim">
          <span className={`inline-block h-2 w-2 rounded-full ${DOT[s]}`} />
          <span>{label}</span>
          {status?.version && <span className="font-mono">v{status.version}</span>}
        </div>
      </div>

      <p className="mt-1 text-[11px] text-trails-fg-dim">
        {s === "running" ? (
          <>
            AI features talk to{" "}
            <code className="font-mono">{status?.endpoint}</code>. Questline
            attaches to your own Ollama when present, otherwise runs its own.
          </>
        ) : s === "needs-install" ? (
          "No Ollama binary found. Download the engine once (~tens of MB) and Questline will manage it for you."
        ) : s === "error" ? (
          status?.error || "The engine failed to start — see the app logs."
        ) : (
          "An Ollama binary is available but not running. Start it to enable AI features."
        )}
      </p>

      {(s === "stopped" || s === "error" || s === "needs-install") && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={start}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-md border border-trails-accent/60 bg-trails-accent/10 px-2.5 py-1 font-display text-[10px] uppercase tracking-widest text-trails-accent hover:bg-trails-accent/20 disabled:opacity-50"
          >
            {busy === "start" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Power className="h-3 w-3" />
            )}
            Start engine
          </button>

          {s === "needs-install" && (
            <button
              onClick={install}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-md border border-jrpg-gold/60 bg-jrpg-gold/10 px-2.5 py-1 font-display text-[10px] uppercase tracking-widest text-jrpg-gold hover:bg-jrpg-gold/20 disabled:opacity-50"
            >
              {busy === "install" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Download className="h-3 w-3" />
              )}
              {busy === "install"
                ? pct !== null
                  ? `Downloading… ${pct}%`
                  : "Downloading…"
                : "Download AI engine"}
            </button>
          )}
          <span className="text-[10px] text-trails-fg-dim">
            The app restarts once the engine is ready.
          </span>
        </div>
      )}
    </section>
  );
}
