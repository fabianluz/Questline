"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  Cpu,
  Database,
  HardDrive,
  HelpCircle,
  Play,
  RefreshCw,
  ServerOff,
} from "lucide-react";

/**
 * Tutorial-page Requirements panel.
 *
 * Lists every external runtime Questline depends on, shows its live
 * status via /api/health, and surfaces a one-click "Start" button when
 * the service can be launched from the app.
 *
 * Three tiers of action per requirement:
 *   - Install   : a `brew install` command the user must run once. We
 *                 just show the command + a copy button.
 *   - Start     : POST /api/system/start/<service> kicks it. We can
 *                 launch OrbStack, Postgres (via docker compose), and
 *                 Ollama from here.
 *   - Verify    : polls /api/health and renders the result as a status
 *                 pill (green = up, red = down, amber = up but missing
 *                 something secondary like the LLM model).
 */

type Health = {
  postgres: {
    reachable: boolean;
    version: string | null;
    host: string;
    error: string | null;
    latencyMs: number | null;
  };
  ollama: {
    reachable: boolean;
    model: string;
    modelInstalled: boolean;
    installedModels: string[];
    host: string;
    error: string | null;
  };
  checkedAt: string;
};

type Tier = "ok" | "warn" | "down";

export function RequirementsSection() {
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      setHealth(await res.json());
    } catch (err) {
      setHealth({
        postgres: {
          reachable: false,
          version: null,
          host: "(unknown)",
          error: err instanceof Error ? err.message : String(err),
          latencyMs: null,
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
    const id = setInterval(refresh, 10_000);
    return () => clearInterval(id);
  }, [refresh]);

  async function start(service: "orbstack" | "postgres" | "ollama") {
    setBusy(service);
    setFeedback(null);
    try {
      const res = await fetch(`/api/system/start/${service}`, {
        method: "POST",
      });
      const body = (await res.json()) as {
        ok: boolean;
        label?: string;
        what?: string;
        error?: string;
      };
      setFeedback(
        body.ok
          ? `${body.label}: ${body.what ?? "launched."} The status pill will refresh in a few seconds.`
          : `Couldn't start ${service}: ${body.error}`,
      );
      setTimeout(refresh, 4_000);
      setTimeout(refresh, 12_000);
    } catch (err) {
      setFeedback(
        `Failed to call start endpoint: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    } finally {
      setBusy(null);
    }
  }

  const orbstackTier: Tier =
    !health || health.postgres.reachable
      ? "ok" // assume OrbStack is up if Postgres is reachable
      : "down";
  const postgresTier: Tier = !health
    ? "down"
    : health.postgres.reachable
      ? "ok"
      : "down";
  const ollamaTier: Tier = !health
    ? "down"
    : !health.ollama.reachable
      ? "down"
      : !health.ollama.modelInstalled
        ? "warn"
        : "ok";

  return (
    <section className="rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="!m-0 !border-0 !p-0 flex items-center gap-2 font-display text-sm uppercase tracking-widest text-trails-accent">
          <HardDrive className="h-4 w-4 text-trails-accent" />
          Requirements · runtimes Questline depends on
          <span
            title="Questline is 100% local. These are the only external runtimes it talks to — all on your laptop. The status pills auto-refresh every 10 seconds while this page is open."
            className="text-trails-info"
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </span>
        </h2>
        <button
          onClick={refresh}
          disabled={loading}
          title="Re-check everything right now"
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 font-display text-[10px] uppercase tracking-widest text-trails-fg-dim hover:text-trails-accent disabled:opacity-50"
        >
          <RefreshCw className={loading ? "h-3 w-3 animate-spin" : "h-3 w-3"} />
          Recheck
        </button>
      </div>

      {feedback && (
        <p className="mt-3 rounded-md border border-trails-accent/40 bg-trails-accent/10 p-2 text-xs text-trails-accent-bright">
          {feedback}
        </p>
      )}

      <ul className="mt-4 space-y-3">
        {/* OrbStack */}
        <RequirementRow
          icon={<HardDrive className="h-4 w-4" />}
          name="OrbStack (Docker daemon)"
          purpose="Provides Docker on macOS. Required to run the Postgres container Questline uses for ALL data + sessions."
          tier={orbstackTier}
          tierLabel={
            orbstackTier === "ok"
              ? "Running (Postgres is reachable)"
              : "Down — Postgres not reachable"
          }
          installCmd="brew install orbstack"
          installNote="Or download the menu-bar app from orbstack.dev. After install, tick OrbStack ▸ Settings ▸ Start on login to skip this step in the future."
          startLabel="Start OrbStack"
          starting={busy === "orbstack"}
          onStart={() => start("orbstack")}
        />

        {/* Postgres container */}
        <RequirementRow
          icon={<Database className="h-4 w-4" />}
          name="Postgres container (questline-postgres)"
          purpose={`Holds every Category, Skill, Epic, Quest, Inventory entry, Session — basically all your data. ${
            health?.postgres.host
              ? `Configured at ${health.postgres.host}.`
              : ""
          }`}
          tier={postgresTier}
          tierLabel={
            postgresTier === "ok" && health?.postgres.version
              ? `Up · ${health.postgres.version}${
                  health.postgres.latencyMs != null
                    ? ` · ${health.postgres.latencyMs} ms`
                    : ""
                }`
              : `Down${health?.postgres.error ? ` · ${health.postgres.error}` : ""}`
          }
          installCmd="docker compose up -d"
          installNote="The compose file in the repo defines a single Postgres 16 + pgvector container. First-time bootstrap downloads the image — gives way faster on subsequent runs."
          startLabel="Start Postgres"
          starting={busy === "postgres"}
          onStart={() => start("postgres")}
        />

        {/* Ollama */}
        <RequirementRow
          icon={<Cpu className="h-4 w-4" />}
          name="Ollama (local LLM)"
          purpose="Powers the AI Guide (Epic break-down, schedule advice, resource recommendations, side-quest generator, retro drafts). Optional — the rest of Questline works without it."
          tier={ollamaTier}
          tierLabel={
            ollamaTier === "ok"
              ? `Ready · model ${health?.ollama.model} installed`
              : ollamaTier === "warn"
                ? `Up but model ${health?.ollama.model} not pulled`
                : `Down${
                    health?.ollama.error ? ` · ${health.ollama.error}` : ""
                  }`
          }
          installCmd="brew install ollama"
          installNote={
            ollamaTier === "warn"
              ? `Daemon is up but the configured model isn't pulled. Run \`ollama pull ${health?.ollama.model}\` once.`
              : "On first run, also `ollama pull qwen2.5:14b` (one-time, ~9 GB)."
          }
          startLabel="Start Ollama"
          starting={busy === "ollama"}
          onStart={() => start("ollama")}
        />
      </ul>

      {health && (
        <p className="mt-3 text-right font-mono text-[10px] text-trails-fg-dim">
          last check {new Date(health.checkedAt).toLocaleTimeString()}
        </p>
      )}
    </section>
  );
}

function RequirementRow({
  icon,
  name,
  purpose,
  tier,
  tierLabel,
  installCmd,
  installNote,
  startLabel,
  starting,
  onStart,
}: {
  icon: React.ReactNode;
  name: string;
  purpose: string;
  tier: Tier;
  tierLabel: string;
  installCmd: string;
  installNote?: string;
  startLabel: string;
  starting: boolean;
  onStart: () => void;
}) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(installCmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <li className="rounded-md border p-3">
      <div className="flex flex-wrap items-start gap-3">
        <span
          className={
            "mt-0.5 shrink-0 " +
            (tier === "ok"
              ? "text-trails-good"
              : tier === "warn"
                ? "text-trails-warn"
                : "text-trails-bad")
          }
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-sm font-semibold text-trails-fg">{name}</span>
            <TierPill tier={tier} label={tierLabel} />
          </div>
          <p className="mt-1 text-xs text-trails-fg-dim">{purpose}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="rounded-md border border-trails-trim/40 bg-trails-bg-deep/60 px-2 py-1 font-mono text-[11px] text-trails-accent">
              {installCmd}
            </code>
            <button
              onClick={copy}
              title="Copy install / start command"
              className="rounded-md border p-1 text-trails-fg-dim hover:text-trails-accent"
            >
              {copied ? (
                <Check className="h-3 w-3" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </button>
          </div>
          {installNote && (
            <p className="mt-1 text-[11px] italic text-trails-fg-dim">
              {installNote}
            </p>
          )}
        </div>
        {tier !== "ok" && (
          <button
            onClick={onStart}
            disabled={starting}
            title={
              tier === "down"
                ? `${startLabel} — runs the launch command on the host`
                : "Already running — but you can still re-launch"
            }
            className="inline-flex items-center gap-1 rounded-md border border-trails-trim/40 px-2 py-1 font-display text-[10px] uppercase tracking-widest text-trails-fg hover:bg-trails-bg-glow disabled:opacity-50"
          >
            <Play className="h-3 w-3" />
            {starting ? "Starting…" : startLabel}
          </button>
        )}
      </div>
    </li>
  );
}

function TierPill({ tier, label }: { tier: Tier; label: string }) {
  if (tier === "ok") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-trails-good/60 bg-trails-good/15 px-2 py-0.5 font-display text-[9px] uppercase tracking-widest text-trails-good">
        <Check className="h-2.5 w-2.5" /> {label}
      </span>
    );
  }
  if (tier === "warn") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-trails-warn/60 bg-trails-warn/15 px-2 py-0.5 font-display text-[9px] uppercase tracking-widest text-trails-warn">
        <AlertTriangle className="h-2.5 w-2.5" /> {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-trails-bad/60 bg-trails-bad/15 px-2 py-0.5 font-display text-[9px] uppercase tracking-widest text-trails-bad">
      <ServerOff className="h-2.5 w-2.5" /> {label}
    </span>
  );
}
