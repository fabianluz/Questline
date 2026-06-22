"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CircleAlert,
  Play,
  RefreshCw,
  X,
} from "lucide-react";

/**
 * Sticky banner shown across the top of the app when one of the runtimes
 * Questline depends on is unreachable. The big motivating case: when
 * OrbStack / the Postgres container is down, every tRPC call surfaces a
 * generic "Failed to get session" error inside individual screens. This
 * banner detects that situation up-front and tells the user EXACTLY what's
 * wrong and how to fix it (one click).
 *
 * States rendered:
 *   - Postgres down → RED sticky banner with "Start OrbStack" + "Start
 *                     Postgres" + "Retry" buttons. Cannot be dismissed
 *                     (the app doesn't work without the DB).
 *   - Ollama down  → AMBER banner. Dismissible — most of the app works.
 *   - Everything OK → no banner.
 *
 * Polls /api/health every 20s. Also re-checks on window focus so users
 * who recover OrbStack from outside Questline get an instant green.
 */

type HealthSnapshot = {
  postgres: {
    reachable: boolean;
    version: string | null;
    host: string;
    error: string | null;
  };
  ollama: {
    reachable: boolean;
    model: string;
    modelInstalled: boolean;
    warm?: boolean;
    installedModels: string[];
    host: string;
    error: string | null;
  };
  checkedAt: string;
};

export function SystemHealthBanner() {
  const [snap, setSnap] = useState<HealthSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [startingService, setStartingService] = useState<string | null>(null);
  const [startResult, setStartResult] = useState<string | null>(null);
  const [ollamaDismissed, setOllamaDismissed] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      const body = (await res.json()) as HealthSnapshot;
      setSnap(body);
    } catch (err) {
      // If even /api/health fails, the dev server is down — render a
      // very obvious fallback. Browser will retry on next interval.
      setSnap({
        postgres: {
          reachable: false,
          version: null,
          host: "(unknown)",
          error: err instanceof Error ? err.message : String(err),
        },
        ollama: {
          reachable: false,
          model: "",
          modelInstalled: false,
          installedModels: [],
          host: "(unknown)",
          error: null,
        },
        checkedAt: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 20_000);
    function onFocus() {
      refresh();
    }
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  async function start(service: "orbstack" | "postgres" | "ollama") {
    setStartingService(service);
    setStartResult(null);
    try {
      const res = await fetch(`/api/system/start/${service}`, {
        method: "POST",
      });
      const body = (await res.json()) as {
        ok: boolean;
        label?: string;
        error?: string;
        what?: string;
      };
      if (body.ok) {
        setStartResult(
          `${body.label}: launched. ${body.what ?? ""} Health check will retry in a moment.`,
        );
        // Two follow-up polls — once now-ish (give OrbStack a couple of
        // seconds to come up), and once a bit later as a safety net.
        setTimeout(() => refresh(), 4_000);
        setTimeout(() => refresh(), 12_000);
      } else {
        setStartResult(`Failed to start ${service}: ${body.error}`);
      }
    } catch (err) {
      setStartResult(
        `Failed to call start endpoint: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    } finally {
      setStartingService(null);
    }
  }

  if (!snap) return null;

  const postgresDown = !snap.postgres.reachable;
  const ollamaDown = !snap.ollama.reachable;
  const ollamaModelMissing =
    snap.ollama.reachable && !snap.ollama.modelInstalled;

  if (!postgresDown && !ollamaDown && !ollamaModelMissing) {
    return null;
  }

  return (
    <>
      {postgresDown && (
        <div className="sticky top-0 z-[60] border-b-2 border-trails-bad bg-trails-bad/15 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-6 py-2 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0 text-trails-bad" />
            <div className="min-w-0 flex-1">
              <div className="font-display text-[12px] uppercase tracking-widest text-trails-bad">
                Database not reachable
              </div>
              <div className="text-xs text-trails-fg">
                Questline can't reach Postgres at{" "}
                <code className="font-mono text-trails-accent">
                  {snap.postgres.host}
                </code>
                . That's why sign-in / sign-up / data load fails with{" "}
                <strong>"Failed to get session"</strong>. Almost always
                because OrbStack (the Docker daemon) isn't running. Fix
                from here:
              </div>
              {snap.postgres.error && (
                <div className="mt-0.5 font-mono text-[10px] text-trails-bad/80">
                  {snap.postgres.error}
                </div>
              )}
              {startResult && (
                <div className="mt-1 font-mono text-[11px] text-trails-accent-bright">
                  {startResult}
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => start("orbstack")}
                disabled={startingService !== null}
                title="Run `open -ga OrbStack` on the host (starts the Docker daemon)"
                className="inline-flex items-center gap-1 rounded-md border border-trails-bad/60 bg-trails-bad/10 px-2 py-1 font-display text-[10px] uppercase tracking-widest text-trails-fg hover:bg-trails-bad/20 disabled:opacity-50"
              >
                <Play className="h-3 w-3" />
                {startingService === "orbstack" ? "Starting…" : "Start OrbStack"}
              </button>
              <button
                onClick={() => start("postgres")}
                disabled={startingService !== null}
                title="Run `docker compose up -d` on the host (brings the questline-postgres container online; needs OrbStack already up)"
                className="inline-flex items-center gap-1 rounded-md border border-trails-bad/60 bg-trails-bad/10 px-2 py-1 font-display text-[10px] uppercase tracking-widest text-trails-fg hover:bg-trails-bad/20 disabled:opacity-50"
              >
                <Play className="h-3 w-3" />
                {startingService === "postgres" ? "Starting…" : "Start Postgres"}
              </button>
              <button
                onClick={refresh}
                disabled={loading}
                title="Re-run /api/health right now"
                className="inline-flex items-center gap-1 rounded-md border border-trails-trim/40 px-2 py-1 font-display text-[10px] uppercase tracking-widest text-trails-fg hover:bg-trails-bg-glow disabled:opacity-50"
              >
                <RefreshCw
                  className={loading ? "h-3 w-3 animate-spin" : "h-3 w-3"}
                />
                Retry
              </button>
            </div>
          </div>
        </div>
      )}

      {!postgresDown && (ollamaDown || ollamaModelMissing) && !ollamaDismissed && (
        <div className="sticky top-0 z-[60] border-b border-trails-warn/60 bg-trails-warn/10 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-1.5 text-xs">
            <CircleAlert className="h-3.5 w-3.5 shrink-0 text-trails-warn" />
            <div className="min-w-0 flex-1 text-trails-fg">
              {ollamaDown ? (
                <>
                  Local LLM unreachable at{" "}
                  <code className="font-mono text-trails-accent">
                    {snap.ollama.host}
                  </code>
                  . AI Guide features (epic break-down, side-quest generator,
                  schedule advice, retro drafts) won't work until Ollama is
                  running. The rest of the app is unaffected.
                </>
              ) : (
                <>
                  Ollama is up but model{" "}
                  <code className="font-mono text-trails-accent">
                    {snap.ollama.model}
                  </code>{" "}
                  isn't pulled. Run{" "}
                  <code className="font-mono text-trails-accent">
                    ollama pull {snap.ollama.model}
                  </code>{" "}
                  once.
                </>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {ollamaDown && (
                <button
                  onClick={() => start("ollama")}
                  disabled={startingService !== null}
                  title="Run `open -ga Ollama` on the host"
                  className="inline-flex items-center gap-1 rounded-md border border-trails-warn/60 px-2 py-0.5 font-display text-[10px] uppercase tracking-widest text-trails-fg hover:bg-trails-warn/15 disabled:opacity-50"
                >
                  <Play className="h-3 w-3" />
                  {startingService === "ollama" ? "Starting…" : "Start Ollama"}
                </button>
              )}
              <button
                onClick={refresh}
                disabled={loading}
                className="inline-flex items-center gap-1 rounded-md border border-trails-trim/40 px-2 py-0.5 font-display text-[10px] uppercase tracking-widest text-trails-fg hover:bg-trails-bg-glow disabled:opacity-50"
              >
                <RefreshCw
                  className={loading ? "h-3 w-3 animate-spin" : "h-3 w-3"}
                />
                Retry
              </button>
              <button
                onClick={() => setOllamaDismissed(true)}
                title="Dismiss until next page reload"
                className="rounded-md p-1 text-trails-fg-dim hover:text-trails-fg"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
