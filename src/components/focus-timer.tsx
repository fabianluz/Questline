"use client";

import { useEffect, useState } from "react";
import { Square, Timer, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/toast";

type StartInput = {
  label: string;
  refType?: "milestone" | "step" | "quest" | "none";
  refId?: string | null;
  skillId?: string | null;
};

/** Start a focus session from anywhere (e.g. a step's "Focus" button). */
export function startFocus(input: StartInput) {
  window.dispatchEvent(
    new CustomEvent("questline:focus-start", { detail: input }),
  );
}

/**
 * Floating focus-session timer. Shows a running session (elapsed, Stop, Discard)
 * fixed bottom-left, and listens for `startFocus()` events to begin one. Stopping
 * logs the minutes and awards XP to the linked skill.
 */
export function FocusTimer() {
  const utils = trpc.useUtils();
  const toast = useToast();
  const { data: active } = trpc.focus.active.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const [elapsed, setElapsed] = useState(0);

  const start = trpc.focus.start.useMutation({
    onSuccess: () => utils.focus.active.invalidate(),
  });
  const stop = trpc.focus.stop.useMutation({
    onSuccess: (r) => {
      utils.focus.active.invalidate();
      utils.skill.list.invalidate();
      if (r.stopped) {
        const min = r.session?.durationMin ?? 0;
        const xp = r.session?.xpAwarded ?? 0;
        toast({
          title: "Focus session logged",
          description: `${min} min${xp ? ` · +${xp} XP` : ""}`,
          variant: "success",
        });
      }
    },
  });
  const cancel = trpc.focus.cancel.useMutation({
    onSuccess: () => utils.focus.active.invalidate(),
  });

  useEffect(() => {
    function onStart(e: Event) {
      const d = (e as CustomEvent).detail as StartInput;
      start.mutate({
        label: d.label,
        refType: d.refType ?? "none",
        refId: d.refId ?? null,
        skillId: d.skillId ?? null,
      });
    }
    window.addEventListener("questline:focus-start", onStart);
    return () => window.removeEventListener("questline:focus-start", onStart);
  }, [start]);

  useEffect(() => {
    if (!active) {
      setElapsed(0);
      return;
    }
    const startedMs = new Date(active.startedAt).getTime();
    const tick = () =>
      setElapsed(Math.max(0, Math.floor((Date.now() - startedMs) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [active]);

  if (!active) return null;
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="fixed bottom-4 left-4 z-[95] flex items-center gap-3 rounded-lg border-2 border-jrpg-gold/60 bg-trails-panel/95 px-3 py-2 shadow-xl backdrop-blur">
      <Timer className="h-4 w-4 animate-pulse text-jrpg-gold" aria-hidden />
      <div className="min-w-0">
        <div className="max-w-[200px] truncate text-sm font-semibold text-trails-fg">
          {active.label}
        </div>
        <div className="font-mono text-xs tabular-nums text-jrpg-gold">
          {mm}:{ss}
        </div>
      </div>
      <button
        onClick={() => stop.mutate({})}
        disabled={stop.isPending}
        title="Stop &amp; log this session"
        className="inline-flex items-center gap-1 rounded-md border border-trails-good/60 bg-trails-good/15 px-2 py-1 font-display text-[10px] uppercase tracking-widest text-trails-good hover:bg-trails-good/25 disabled:opacity-50"
      >
        <Square className="h-3 w-3" /> Stop
      </button>
      <button
        onClick={() => cancel.mutate()}
        aria-label="Discard session"
        title="Discard (no time logged)"
        className="rounded p-0.5 text-trails-fg-dim hover:text-trails-bad"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
