"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  CircleAlert,
  Copy,
  Cpu,
  ExternalLink,
  HelpCircle,
  RefreshCw,
} from "lucide-react";

/**
 * Dashboard card surfacing the local Ollama daemon's status so the user
 * always knows whether AI features will work.
 *
 * Three states:
 *   green : daemon reachable AND configured model installed → ready
 *   amber : daemon reachable but model NOT installed → one-line pull
 *   red   : daemon unreachable → full install + start instructions
 *
 * Under the Trails palette, the panel chassis comes from the cascading
 * rule. Status semantics use trails-good / trails-warn / trails-bad so
 * the traffic-light remains immediately legible.
 */

type Status = {
  reachable: boolean;
  model: string;
  modelInstalled: boolean;
  installedModels: string[];
  host: string;
  error?: string;
};

export function OllamaStatusCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/ollama/status", { cache: "no-store" });
      setStatus(await res.json());
    } catch {
      // Transient — e.g. dev server restarting, or network blip. Leave the
      // last-known status in place; the next poll recovers. Swallowing here
      // prevents an unhandledRejection in the console.
      setStatus((prev) =>
        prev ?? {
          reachable: false,
          model: "",
          modelInstalled: false,
          installedModels: [],
          host: "",
          error: "status endpoint unreachable",
        },
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // Re-check every 30s so the user sees recovery without manual refresh.
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, []);

  const level: "ready" | "no_model" | "down" = !status
    ? "down"
    : !status.reachable
      ? "down"
      : !status.modelInstalled
        ? "no_model"
        : "ready";

  const PULL_CMD = status ? `ollama pull ${status.model}` : "";

  // Tint the whole panel border with the level color so the cascade gives
  // us a Trails-style menu panel + the level reads at a glance.
  const borderTint =
    level === "ready"
      ? "border-trails-good/50"
      : level === "no_model"
        ? "border-trails-warn/50"
        : "border-trails-bad/50";

  return (
    <section className={"rounded-lg border p-4 " + borderTint}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu
            className={
              "h-4 w-4 " +
              (level === "ready"
                ? "text-trails-good"
                : level === "no_model"
                  ? "text-trails-warn"
                  : "text-trails-bad")
            }
          />
          <h2 className="!m-0 !border-0 !p-0 font-display text-sm uppercase tracking-widest text-trails-accent">
            AI Guide · Ollama
          </h2>
          {level === "ready" && (
            <span className="inline-flex items-center gap-1 rounded-full border border-trails-good/60 bg-trails-good/15 px-2 py-0.5 font-display text-[9px] uppercase tracking-widest text-trails-good">
              <Check className="h-2.5 w-2.5" /> ready
            </span>
          )}
          {level === "no_model" && (
            <span className="inline-flex items-center gap-1 rounded-full border border-trails-warn/60 bg-trails-warn/15 px-2 py-0.5 font-display text-[9px] uppercase tracking-widest text-trails-warn">
              <CircleAlert className="h-2.5 w-2.5" /> missing model
            </span>
          )}
          {level === "down" && (
            <span className="inline-flex items-center gap-1 rounded-full border border-trails-bad/60 bg-trails-bad/15 px-2 py-0.5 font-display text-[9px] uppercase tracking-widest text-trails-bad">
              <AlertTriangle className="h-2.5 w-2.5" /> not running
            </span>
          )}
          <span
            title="Ollama is the local LLM runtime that powers The Guide (epic break-down, side-quest generator, schedule advice, resource recommendations, retro drafts). Questline never calls a cloud LLM — if this card is red, AI features simply don't work, but the rest of the app is unaffected."
            className="text-trails-info"
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </span>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          title="Re-check the Ollama daemon now"
          className="rounded-md border p-1.5 text-trails-fg-dim hover:text-trails-accent disabled:opacity-50"
        >
          <RefreshCw className={loading ? "h-3 w-3 animate-spin" : "h-3 w-3"} />
        </button>
      </div>

      {level === "ready" && status && (
        <p className="mt-2 text-xs text-trails-fg">
          Daemon up at <code className="font-mono text-trails-accent">{status.host}</code>,
          model{" "}
          <code className="font-mono text-trails-accent">{status.model}</code>{" "}
          installed. AI Guide, side-quest generator, schedule advice, resource
          recommendations, and weekly retrospective drafts are all available.
        </p>
      )}

      {level === "no_model" && status && (
        <div className="mt-2 space-y-2 text-xs text-trails-fg">
          <p>
            Daemon is running but{" "}
            <code className="font-mono text-trails-warn">{status.model}</code>{" "}
            isn't installed. Pull it once (~4 GB) — Ollama caches it locally
            afterwards.
          </p>
          <CopyableCommand cmd={PULL_CMD} />
          {status.installedModels.length > 0 && (
            <p className="text-[10px] text-trails-fg-dim">
              Already installed:{" "}
              <span className="font-mono">
                {status.installedModels.join(", ")}
              </span>
              . To use one of those instead, set{" "}
              <code className="font-mono text-trails-accent">
                OLLAMA_MODEL=&lt;name&gt;
              </code>{" "}
              in <code className="font-mono">.env.local</code> and restart the
              dev server.
            </p>
          )}
        </div>
      )}

      {level === "down" && (
        <div className="mt-2 space-y-2 text-xs text-trails-fg">
          <p>
            Ollama is the local LLM runtime that powers the AI Guide. Questline
            is 100% local — no remote API calls — so you need it running on
            this Mac for AI features to work. The rest of the app works fine
            without it.
          </p>
          <ol className="ml-4 list-decimal space-y-1.5">
            <li>
              Install Ollama:{" "}
              <CopyableCommand cmd="brew install ollama" inline />
            </li>
            <li>
              Start the daemon (or open the menu-bar app):{" "}
              <CopyableCommand cmd="ollama serve" inline />
            </li>
            <li>
              Pull the default model (one-time, ~9 GB):{" "}
              <CopyableCommand cmd="ollama pull qwen2.5:14b" inline />
            </li>
          </ol>
          {status?.error && (
            <p className="rounded-md border border-trails-bad/60 bg-trails-bad/10 p-1.5 font-mono text-[10px] text-trails-bad">
              {status.error}
            </p>
          )}
        </div>
      )}

      <p className="mt-3">
        <Link
          href="/help/ollama"
          className="inline-flex items-center gap-1 font-display text-[10px] uppercase tracking-widest text-trails-accent hover:text-trails-accent-bright"
        >
          Full setup guide <ExternalLink className="h-2.5 w-2.5" />
        </Link>
      </p>
    </section>
  );
}

function CopyableCommand({
  cmd,
  inline,
}: {
  cmd: string;
  inline?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <span
      className={
        inline
          ? "inline-flex items-center gap-1 rounded-md border border-trails-trim/40 bg-trails-bg-deep/60 px-1.5 py-0.5 align-middle"
          : "flex items-center gap-2 rounded-md border border-trails-trim/40 bg-trails-bg-deep/60 p-2"
      }
    >
      <code className="flex-1 font-mono text-[11px] text-trails-accent">
        {cmd}
      </code>
      <button
        onClick={copy}
        title="Copy command to clipboard"
        className="rounded p-0.5 text-trails-fg-dim hover:text-trails-accent"
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      </button>
    </span>
  );
}
