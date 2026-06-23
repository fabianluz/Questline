"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Cpu,
  Download,
  HardDrive,
  Loader2,
  RefreshCw,
  Square,
  Star,
  Trash2,
} from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/trpc/routers/_app";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { SurfaceRoutingCard } from "@/components/surface-routing-card";
import { HouseStyleCard } from "@/components/house-style-card";
import { EngineCard } from "@/components/engine-card";
import {
  estimateTokensPerSec,
  speedLabel,
  isLowQuant,
  quantQuality,
  type SpeedTier,
} from "@/lib/hw-perf";

type FitVerdict = "ok" | "tight" | "over" | "unknown";
type ModelRowModel =
  inferRouterOutputs<AppRouter>["models"]["list"]["models"][number];

function fmtBytes(n: number | undefined): string {
  if (!n) return "—";
  const gb = n / 1024 ** 3;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(n / 1024 ** 2)} MB`;
}

const FIT_LABEL: Record<FitVerdict, string> = {
  ok: "fits well",
  tight: "tight on RAM",
  over: "may not load",
  unknown: "",
};
const FIT_CLASS: Record<FitVerdict, string> = {
  ok: "border-trails-good/50 text-trails-good",
  tight: "border-trails-warn/50 text-trails-warn",
  over: "border-trails-bad/50 text-trails-bad",
  unknown: "border-trails-trim/40 text-trails-fg-dim",
};
const SPEED_CLASS: Record<SpeedTier, string> = {
  fast: "text-trails-good",
  ok: "text-trails-fg-dim",
  slow: "text-trails-warn",
};

export default function ModelsPage() {
  const utils = trpc.useUtils();
  const toast = useToast();

  const { data, isLoading, refetch, isRefetching } = trpc.models.list.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const { data: selected } = trpc.models.selected.useQuery();

  const [pullingRef, setPullingRef] = useState<string | null>(null);
  const [pull, setPull] = useState<{ status: string; completed?: number; total?: number } | null>(null);
  const [busyRef, setBusyRef] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pullAbort = useRef<AbortController | null>(null);

  const invalidate = () => {
    utils.models.list.invalidate();
    utils.models.selected.invalidate();
  };

  const setSelected = trpc.models.setSelected.useMutation({
    onSuccess: (r) => {
      invalidate();
      toast({ title: "Model switched", description: r.active, variant: "success" });
    },
    onError: (e) => toast({ title: "Couldn't switch", description: e.message, variant: "error" }),
  });

  const remove = trpc.models.remove.useMutation({
    onSuccess: () => {
      invalidate();
      toast({ title: "Model deleted", variant: "success" });
    },
    onError: (e) => toast({ title: "Delete failed", description: e.message, variant: "error" }),
    onSettled: () => setBusyRef(null),
  });

  function cancelPull() {
    pullAbort.current?.abort();
  }

  async function doPull(ref: string) {
    setError(null);
    setPullingRef(ref);
    setPull({ status: "starting" });
    const abort = new AbortController();
    pullAbort.current = abort;
    try {
      const res = await fetch("/api/models/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: ref }),
        signal: abort.signal,
      });
      if (!res.body) throw new Error("No response stream");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const p of parts) {
          const line = p.trim();
          if (!line.startsWith("data:")) continue;
          const evt = JSON.parse(line.slice(5).trim());
          if (evt.type === "progress") {
            setPull({ status: evt.status, completed: evt.completed, total: evt.total });
          } else if (evt.type === "error") {
            setError(evt.message);
          }
        }
      }
      toast({ title: "Pull complete", description: ref, variant: "success" });
      invalidate();
    } catch (err) {
      // A user-initiated cancel isn't an error — just stop quietly.
      if (err instanceof DOMException && err.name === "AbortError") {
        toast({ title: "Pull cancelled", description: ref });
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      pullAbort.current = null;
      setPullingRef(null);
      setPull(null);
    }
  }

  const models = data?.models ?? [];
  const installed = models.filter((m) => m.installed);
  const available = models.filter((m) => !m.installed);
  const activeRef = selected?.active ?? data?.active;

  // First-run recommendation: the best catalog model that fits this Mac's RAM.
  // Prefer a comfortable fit, then the "balanced" sweet spot.
  const recommended = (() => {
    if (!data?.reachable || available.length === 0) return null;
    const tierRank: Record<string, number> = { balanced: 0, fast: 1, heavy: 2 };
    const pool =
      available.filter((m) => m.fit === "ok").length > 0
        ? available.filter((m) => m.fit === "ok")
        : available.filter((m) => m.fit === "tight").length > 0
          ? available.filter((m) => m.fit === "tight")
          : available;
    return [...pool].sort(
      (a, b) => (tierRank[a.tier ?? "heavy"] ?? 3) - (tierRank[b.tier ?? "heavy"] ?? 3),
    )[0];
  })();

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2">
            <Cpu className="h-5 w-5 text-trails-accent" />
            AI Models
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-trails-fg-dim">
            Every AI action (epic break-down, chapter planner, Ask the Guide,
            notes→JSON, skill suggestions) runs locally on the model you pick
            here. Switch any time; pulls run inside the app.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isRefetching}
          className="inline-flex items-center gap-1.5 rounded-md border border-trails-trim/60 px-2.5 py-1 text-xs text-trails-fg-dim hover:text-trails-accent disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isRefetching && "animate-spin")} />
          Refresh
        </button>
      </header>

      {/* Active model banner */}
      <section className="jrpg-panel flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 text-jrpg-gold" />
          <span className="font-display text-[11px] uppercase tracking-widest text-trails-fg-dim">
            Active model
          </span>
          <span className="font-mono text-sm font-semibold text-trails-fg">
            {activeRef ?? "—"}
          </span>
        </div>
        {data && (
          <span className="text-[11px] text-trails-fg-dim">
            {data.reachable
              ? `${data.installedCount} installed · ${fmtBytes(data.totalMemoryBytes)} system RAM`
              : "Ollama not reachable"}
          </span>
        )}
      </section>

      {/* Local AI engine status + controls (desktop self-managed Ollama) */}
      <EngineCard onChanged={() => refetch()} />

      {/* First-run: recommend a RAM-appropriate model + one-click pull */}
      {installed.length === 0 && recommended && (
        <section className="rounded-lg border border-jrpg-gold/50 bg-jrpg-gold/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2">
              <Star className="mt-0.5 h-4 w-4 shrink-0 text-jrpg-gold" />
              <div>
                <p className="font-display text-sm uppercase tracking-widest text-trails-accent">
                  Get started — pull a model
                </p>
                <p className="mt-1 text-xs text-trails-fg-dim">
                  No models installed yet. Recommended for your Mac
                  {data ? ` (${fmtBytes(data.totalMemoryBytes)} RAM)` : ""}:{" "}
                  <span className="font-mono text-trails-fg">{recommended.label}</span>
                  {recommended.sizeBytes || recommended.approxBytes
                    ? ` · ~${fmtBytes(recommended.sizeBytes ?? recommended.approxBytes)}`
                    : ""}
                  . AI features stay dark until one is installed.
                </p>
              </div>
            </div>
            <button
              onClick={() => doPull(recommended.ref)}
              disabled={!!pullingRef}
              className="inline-flex items-center gap-1.5 rounded-md border border-jrpg-gold/60 bg-jrpg-gold/15 px-3 py-1.5 font-display text-[11px] uppercase tracking-widest text-jrpg-gold hover:bg-jrpg-gold/25 disabled:opacity-50"
            >
              {pullingRef === recommended.ref ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              {pullingRef === recommended.ref
                ? pull?.total
                  ? `${Math.round(((pull.completed ?? 0) / pull.total) * 100)}%`
                  : "Pulling…"
                : `Pull ${recommended.ref}`}
            </button>
          </div>
        </section>
      )}

      {/* Per-feature model routing + Auto */}
      <SurfaceRoutingCard />

      {/* Free-text persona override applied to every AI surface */}
      <HouseStyleCard />

      {!data?.reachable && data && (
        <div className="space-y-3 rounded-md border border-trails-bad/60 bg-trails-bad/10 p-3 text-xs text-trails-bad">
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Can&apos;t reach Ollama at {data.host}. Start it (open the Ollama
              app or run <code className="font-mono">ollama serve</code>), then
              Refresh.{data.error ? ` (${data.error})` : ""}
            </span>
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-trails-bad/60 bg-trails-bad/10 p-2 text-xs text-trails-bad">
          {error}
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-trails-fg-dim">Loading models…</p>
      ) : (
        <>
          {/* Installed */}
          <section>
            <h2 className="!m-0 !border-0 !p-0 mb-3 font-display text-sm uppercase tracking-widest text-trails-accent">
              Installed · {installed.length}
            </h2>
            {installed.length === 0 ? (
              <p className="text-xs text-trails-fg-dim">
                No models installed yet. Pull one from the catalog below.
              </p>
            ) : (
              <ul className="space-y-2">
                {installed.map((m) => (
                  <ModelRow
                    key={m.ref}
                    m={m}
                    chip={data?.chip ?? null}
                    active={!!activeRef && m.selected}
                    busy={busyRef === m.ref || (setSelected.isPending && setSelected.variables?.model === m.ref)}
                    onUse={() => {
                      // Guard the exact mistake that prompted this: picking a
                      // model that won't fit RAM (swaps / lingers / runs slow).
                      if (
                        m.fit === "over" &&
                        !confirm(
                          `"${m.ref}" likely exceeds your RAM and may swap, run slowly, or fail to load. Use it anyway?`,
                        )
                      )
                        return;
                      setSelected.mutate({ model: m.ref });
                    }}
                    onDelete={() => {
                      if (confirm(`Delete "${m.ref}" from disk? You can re-pull it later.`)) {
                        setBusyRef(m.ref);
                        remove.mutate({ ref: m.ref });
                      }
                    }}
                  />
                ))}
              </ul>
            )}
          </section>

          {/* Available (catalog, not installed) */}
          {available.length > 0 && (
            <section>
              <h2 className="!m-0 !border-0 !p-0 mb-3 font-display text-sm uppercase tracking-widest text-trails-accent">
                Available to pull · {available.length}
              </h2>
              <ul className="space-y-2">
                {available.map((m) => (
                  <ModelRow
                    key={m.ref}
                    m={m}
                    chip={data?.chip ?? null}
                    active={false}
                    pulling={pullingRef === m.ref}
                    pull={pullingRef === m.ref ? pull : null}
                    disabledPull={!!pullingRef}
                    onPull={() => doPull(m.ref)}
                    onCancel={cancelPull}
                  />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function ModelRow({
  m,
  chip,
  active,
  busy,
  pulling,
  pull,
  disabledPull,
  onUse,
  onDelete,
  onPull,
  onCancel,
}: {
  m: ModelRowModel;
  chip?: string | null;
  active: boolean;
  busy?: boolean;
  pulling?: boolean;
  pull?: { status: string; completed?: number; total?: number } | null;
  disabledPull?: boolean;
  onUse?: () => void;
  onDelete?: () => void;
  onPull?: () => void;
  onCancel?: () => void;
}) {
  const pct =
    pull?.completed && pull?.total ? Math.round((pull.completed / pull.total) * 100) : null;
  // Pre-run estimates (Arcadia-ported hw-perf): rough decode speed on this Mac
  // + a low-quant reliability warning. Both degrade gracefully to nothing.
  const speed = speedLabel(estimateTokensPerSec(m.sizeBytes ?? m.approxBytes, chip));
  const lowQuant = isLowQuant(m.quant);

  return (
    <li
      className={cn(
        "rounded-lg border p-3",
        active ? "border-jrpg-gold/60 bg-jrpg-gold/5" : "border-trails-trim/40",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-sm font-semibold text-trails-fg">{m.label}</span>
        {active && (
          <span className="inline-flex items-center gap-1 rounded-sm border border-jrpg-gold/50 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-jrpg-gold">
            <Check className="h-2.5 w-2.5" /> active
          </span>
        )}
        {m.tier && (
          <span className="rounded-sm border border-trails-trim/50 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-trails-fg-dim">
            {m.tier}
          </span>
        )}
        {m.capabilities.tools && (
          <span className="rounded-sm border border-trails-info/40 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-trails-info">
            tools
          </span>
        )}
        {m.loaded && (
          <span className="rounded-sm border border-trails-good/40 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-trails-good">
            in memory
          </span>
        )}
        {m.fit !== "unknown" && m.fit !== "ok" && (
          <span className={cn("rounded-sm border px-1.5 py-0.5 text-[9px] uppercase tracking-wide", FIT_CLASS[m.fit])}>
            {FIT_LABEL[m.fit]}
          </span>
        )}
        {lowQuant && (
          <span
            title={quantQuality(m.quant) ?? undefined}
            className="inline-flex items-center gap-0.5 rounded-sm border border-trails-warn/50 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-trails-warn"
          >
            <AlertTriangle className="h-2.5 w-2.5" /> low-quant
          </span>
        )}
        {speed && (
          <span
            title="Estimated decode speed for your chip — bigger models run slower"
            className={cn("ml-auto font-mono text-[10px]", SPEED_CLASS[speed.tier])}
          >
            {speed.text}
          </span>
        )}
        <span
          className={cn(
            "inline-flex items-center gap-1 font-mono text-[11px] text-trails-fg-dim",
            !speed && "ml-auto",
          )}
        >
          <HardDrive className="h-3 w-3" />
          {fmtBytes(m.sizeBytes ?? m.approxBytes)}
          {!m.sizeBytes && m.approxBytes ? " (est)" : ""}
        </span>
      </div>

      <div className="mt-1 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-mono text-[11px] text-trails-fg-muted">{m.ref}</p>
          {m.blurb && <p className="mt-0.5 text-xs text-trails-fg-dim">{m.blurb}</p>}
          {m.note && (
            <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-trails-warn">
              <AlertTriangle className="h-3 w-3" /> {m.note}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {m.installed ? (
            <>
              {!active && (
                <button
                  onClick={onUse}
                  disabled={busy}
                  className="inline-flex items-center gap-1 rounded-md border border-trails-accent/60 bg-trails-accent/10 px-2.5 py-1 font-display text-[10px] uppercase tracking-widest text-trails-accent hover:bg-trails-accent/20 disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  Use
                </button>
              )}
              <button
                onClick={onDelete}
                disabled={busy || active}
                title={active ? "Switch to another model before deleting this one" : "Delete from disk"}
                className="rounded-md border px-2 py-1 text-trails-fg-dim hover:text-trails-bad disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          ) : pulling ? (
            <button
              onClick={onCancel}
              className="inline-flex items-center gap-1 rounded-md border border-trails-bad/60 bg-trails-bad/10 px-2.5 py-1 font-display text-[10px] uppercase tracking-widest text-trails-bad hover:bg-trails-bad/20"
            >
              <Square className="h-3 w-3" />
              Stop
            </button>
          ) : (
            <button
              onClick={onPull}
              disabled={disabledPull}
              className="inline-flex items-center gap-1 rounded-md border border-trails-accent/60 bg-trails-accent/10 px-2.5 py-1 font-display text-[10px] uppercase tracking-widest text-trails-accent hover:bg-trails-accent/20 disabled:opacity-50"
            >
              <Download className="h-3 w-3" />
              Pull
            </button>
          )}
        </div>
      </div>

      {pulling && pull && (
        <div className="mt-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-trails-panel-dark">
            <div
              className="h-full rounded-full bg-trails-accent transition-[width]"
              style={{ width: pct !== null ? `${pct}%` : "30%" }}
            />
          </div>
          <p className="mt-1 font-mono text-[10px] text-trails-fg-dim">
            {pull.status}
            {pct !== null ? ` · ${pct}%` : ""}
          </p>
        </div>
      )}
    </li>
  );
}
