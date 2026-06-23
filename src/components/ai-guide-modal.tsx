"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  Loader2,
  RefreshCw,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import type {
  AdvisorEvent,
  MilestoneProposal,
} from "@/lib/advisor-types";
import { cn } from "@/lib/utils";
import { tokensPerSecond } from "@/lib/model-routing";
import { RichText } from "@/components/rich-text";

type RunStats = {
  model: string;
  durationMs: number;
  promptTokens: number;
  responseTokens: number;
};

export function AIGuideModal({
  epicId,
  open,
  onClose,
}: {
  epicId: string;
  open: boolean;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const accept = trpc.advisor.acceptProposals.useMutation({
    // True optimistic: snapshot, prepend stub rows, roll back on error,
    // re-fetch on settle to reconcile with server-assigned IDs/positions.
    onMutate: async (vars) => {
      await utils.epic.byId.cancel({ id: epicId });
      const prev = utils.epic.byId.getData({ id: epicId });
      if (prev) {
        const now = new Date();
        const stubs = vars.proposals.map((p, i) => ({
          id: `optimistic-${now.getTime()}-${i}`,
          epicId,
          title: p.title,
          description: p.description ?? null,
          status: "not_started" as const,
          estimatedStartDate: p.estimatedStartDate ?? null,
          estimatedAchievementDate: p.estimatedAchievementDate ?? null,
          completedAt: null,
          position: 9_999_999 + i, // sort to end of tier until reconciled
          tier: p.tier,
          metadata: vars.provenance ?? null,
          createdAt: now,
          updatedAt: now,
          steps: [],
          resources: [],
          skills: [],
        }));
        utils.epic.byId.setData({ id: epicId }, {
          ...prev,
          milestones: [...prev.milestones, ...stubs] as typeof prev.milestones,
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) utils.epic.byId.setData({ id: epicId }, ctx.prev);
    },
    onSettled: () => {
      utils.epic.byId.invalidate({ id: epicId });
      utils.tree.get.invalidate();
    },
    onSuccess: onClose,
  });

  const [proposals, setProposals] = useState<MilestoneProposal[]>([]);
  const [summaryText, setSummaryText] = useState("");
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [model, setModel] = useState<string | null>(null);
  const [stats, setStats] = useState<RunStats | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [prevSkipped, setPrevSkipped] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const startTimeRef = useRef<number>(0);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startRun = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Carry the last run's rejected list forward so users see the diff
    setPrevSkipped(skipped);
    setSkipped([]);

    setProposals([]);
    setSummaryText("");
    setPicked(new Set());
    setError(null);
    setStats(null);
    setModel(null);
    setRunning(true);
    startTimeRef.current = Date.now();
    setElapsedMs(0);
    if (tickerRef.current) clearInterval(tickerRef.current);
    tickerRef.current = setInterval(
      () => setElapsedMs(Date.now() - startTimeRef.current),
      100,
    );

    try {
      const res = await fetch("/api/advisor/break-down", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ epicId }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        setError(`HTTP ${res.status} — ${await res.text().catch(() => "")}`);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const line = chunk.trimStart();
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          let event: AdvisorEvent;
          try {
            event = JSON.parse(payload);
          } catch {
            continue;
          }
          handleEvent(event);
        }
      }
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
      if (tickerRef.current) {
        clearInterval(tickerRef.current);
        tickerRef.current = null;
      }
    }
  }, [epicId, skipped]);

  function handleEvent(event: AdvisorEvent) {
    switch (event.type) {
      case "start":
        setModel(event.model);
        break;
      case "token":
        setSummaryText((t) => t + event.text);
        break;
      case "proposal":
        setProposals((p) => [...p, event.proposal]);
        break;
      case "tool_skipped":
        setSkipped((s) => [...s, event.reason]);
        break;
      case "done":
        setStats({
          model: model ?? "(unknown)",
          durationMs: event.durationMs,
          promptTokens: event.promptTokens,
          responseTokens: event.responseTokens,
        });
        break;
      case "error":
        setError(event.message);
        break;
    }
  }

  const cancelRun = useCallback(() => {
    abortRef.current?.abort();
    setRunning(false);
    if (tickerRef.current) {
      clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
  }, []);

  // Kick off on first open; tear down on close
  useEffect(() => {
    if (open) {
      startRun();
    } else {
      abortRef.current?.abort();
      accept.reset();
      if (tickerRef.current) clearInterval(tickerRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function togglePick(i: number) {
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function onAccept() {
    const chosen = proposals.filter((_, i) => picked.has(i));
    if (chosen.length === 0) return;
    const provenance =
      stats && model
        ? {
            source: "ai_guide" as const,
            model,
            durationMs: stats.durationMs,
            promptTokens: stats.promptTokens,
            responseTokens: stats.responseTokens,
            generatedAt: new Date().toISOString(),
          }
        : undefined;
    accept.mutate({ epicId, proposals: chosen, provenance });
  }

  if (!open) return null;

  const friendlyError = error ? interpretError(error, model) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-500" />
            <h2 className="text-sm font-semibold">
              The Guide proposes these milestones
            </h2>
            {model && (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {model} · local
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={startRun}
              disabled={running}
              title="Re-roll proposals"
              className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 disabled:opacity-40 dark:hover:bg-zinc-800"
            >
              <RefreshCw
                className={cn("h-3.5 w-3.5", running && "animate-spin")}
              />
            </button>
            <button
              onClick={onClose}
              className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              title="Close (Esc)"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {friendlyError && (
            <ErrorBanner error={friendlyError} onRetry={startRun} />
          )}

          {running && proposals.length === 0 && !error && (
            <div className="flex items-center justify-between gap-2 py-6 text-sm">
              <div className="flex items-center gap-2 text-zinc-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>The Guide is thinking locally</span>
                <span className="font-mono text-xs tabular-nums">
                  · {(elapsedMs / 1000).toFixed(1)}s
                </span>
              </div>
              <button
                onClick={cancelRun}
                className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                <Square className="h-3 w-3" />
                Cancel
              </button>
            </div>
          )}

          {proposals.length > 0 && (
            <ul className="space-y-2">
              {proposals.map((p, i) => (
                <li
                  key={i}
                  className="flex gap-3 rounded-md border border-zinc-200 bg-white p-3 transition-opacity dark:border-zinc-800 dark:bg-zinc-950"
                  style={{
                    animation: "fade-in 0.25s ease-out both",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={picked.has(i)}
                    onChange={() => togglePick(i)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-medium">{p.title}</span>
                      <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                        Tier {p.tier}
                      </span>
                      {p.estimatedAchievementDate && (
                        <span className="text-[10px] text-zinc-500">
                          {p.estimatedStartDate
                            ? `${p.estimatedStartDate} → ${p.estimatedAchievementDate}`
                            : p.estimatedAchievementDate}
                        </span>
                      )}
                    </div>
                    {p.description && (
                      <RichText
                        text={p.description}
                        className="mt-1 text-xs text-zinc-500"
                      />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {running && proposals.length > 0 && (
            <div className="mt-3 flex items-center justify-between gap-2 text-xs text-zinc-400">
              <div className="flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Still thinking...</span>
              </div>
              <button
                onClick={cancelRun}
                className="inline-flex items-center gap-1 rounded border border-zinc-200 px-1.5 py-0.5 hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-800"
              >
                <Square className="h-2.5 w-2.5" />
                Cancel
              </button>
            </div>
          )}

          {summaryText && !running && (
            <p className="mt-4 whitespace-pre-wrap text-xs italic text-zinc-500">
              {summaryText}
            </p>
          )}

          {skipped.length > 0 && !running && (
            <details className="mt-3">
              <summary className="cursor-pointer text-[10px] text-zinc-400 hover:text-zinc-600">
                {skipped.length} tool call{skipped.length === 1 ? "" : "s"}{" "}
                rejected this run
              </summary>
              <ul className="mt-1 space-y-0.5 pl-3 text-[10px] text-zinc-500">
                {skipped.map((s, i) => (
                  <li key={i}>· {s}</li>
                ))}
              </ul>
            </details>
          )}

          {prevSkipped.length > 0 && skipped.length === 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-[10px] text-zinc-400 hover:text-zinc-600">
                Previous run rejected {prevSkipped.length} call
                {prevSkipped.length === 1 ? "" : "s"}
              </summary>
              <ul className="mt-1 space-y-0.5 pl-3 text-[10px] text-zinc-500">
                {prevSkipped.map((s, i) => (
                  <li key={i}>· {s}</li>
                ))}
              </ul>
            </details>
          )}

          {accept.error && (
            <p className="mt-3 text-sm text-red-600">{accept.error.message}</p>
          )}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-zinc-200 px-5 py-3 dark:border-zinc-800">
          <span className="font-mono text-[10px] tabular-nums text-zinc-400">
            {stats
              ? `${(stats.durationMs / 1000).toFixed(1)}s · ${stats.promptTokens} in · ${stats.responseTokens} out${
                  tokensPerSecond(stats.responseTokens, stats.durationMs)
                    ? ` · ${tokensPerSecond(stats.responseTokens, stats.durationMs)!.toFixed(1)} tok/s`
                    : ""
                }`
              : running
                ? `${(elapsedMs / 1000).toFixed(1)}s`
                : `${picked.size} of ${proposals.length} selected`}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              onClick={onAccept}
              disabled={
                picked.size === 0 || accept.isPending || running
              }
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {accept.isPending
                ? "Adding..."
                : `Add ${picked.size || ""} milestone${picked.size === 1 ? "" : "s"}`}
            </button>
          </div>
        </footer>
      </div>

      <style jsx global>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

type FriendlyError = {
  headline: string;
  body: string;
  fixCommand?: string;
};

function interpretError(message: string, model: string | null): FriendlyError {
  if (/can't reach ollama/i.test(message) || /ECONNREFUSED/i.test(message)) {
    return {
      headline: "Ollama isn't running",
      body: "Open the Ollama app from your menu bar — the daemon needs to be live on localhost:11434.",
      fixCommand: "open -a Ollama",
    };
  }
  if (/isn't pulled/i.test(message) || /model.*not found/i.test(message)) {
    const m = model ?? "qwen2.5:14b";
    return {
      headline: `Model "${m}" isn't pulled yet`,
      body: "One-time download. Run this in a terminal, then click Re-roll above.",
      fixCommand: `ollama pull ${m}`,
    };
  }
  return {
    headline: "The Guide couldn't reach the local model",
    body: message,
  };
}

function ErrorBanner({
  error,
  onRetry,
}: {
  error: FriendlyError;
  onRetry: () => void;
}) {
  const [copied, setCopied] = useState(false);
  function copy() {
    if (!error.fixCommand) return;
    navigator.clipboard.writeText(error.fixCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
      <div className="font-medium">{error.headline}</div>
      <p className="mt-1 text-xs">{error.body}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {error.fixCommand && (
          <button
            onClick={copy}
            className="inline-flex items-center gap-1.5 rounded border border-red-200 bg-white px-2 py-1 font-mono text-[11px] text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200 dark:hover:bg-red-900/60"
          >
            {copied ? (
              <Check className="h-3 w-3" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
            {error.fixCommand}
          </button>
        )}
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded border border-red-200 bg-white px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200 dark:hover:bg-red-900/60"
        >
          <RefreshCw className="h-3 w-3" />
          Try again
        </button>
      </div>
    </div>
  );
}
