"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarClock, Check, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Reusable inline deadline editor used across Epics, Milestones, Steps,
 * Skills, and Side Quests. One consistent affordance everywhere.
 *
 * Design: an ALWAYS-VISIBLE controlled `<input type="date">`. We deliberately
 * avoid a click-to-edit toggle + showPicker()/onBlur dance — that pattern
 * races on date-picker selection (the input can unmount before `change`
 * commits, especially in Safari), which made saves silently fail. A plain
 * controlled input has no mount/unmount race: picking a date fires `change`,
 * we save, done.
 *
 * Local state mirrors `value` so the picked date shows instantly (no flicker
 * while the server round-trips), then re-syncs when the fresh value arrives.
 *
 * `value` is a YYYY-MM-DD string (or null) — matches the Postgres `date`
 * columns and the native input format. Passing `null` to `onSave` clears it.
 */
export function DeadlineEditor({
  value,
  onSave,
  saving = false,
  idleLabel = "Deadline",
  className,
  tone = "default",
}: {
  value: string | null;
  onSave: (next: string | null) => void;
  saving?: boolean;
  /** Shown when empty, e.g. "Deadline" / "Due" / "Acquire by" / "Expires". */
  idleLabel?: string;
  className?: string;
  tone?: "default" | "muted";
}) {
  const [local, setLocal] = useState(value ?? "");
  const [justSaved, setJustSaved] = useState(false);
  const wasSaving = useRef(false);

  // Re-sync when the server value changes (e.g. after refetch, or external edit).
  useEffect(() => {
    setLocal(value ?? "");
  }, [value]);

  // Flash a ✓ briefly when a save completes.
  useEffect(() => {
    if (wasSaving.current && !saving) {
      setJustSaved(true);
      const t = setTimeout(() => setJustSaved(false), 1200);
      return () => clearTimeout(t);
    }
    wasSaving.current = saving;
  }, [saving]);

  const today = new Date().toISOString().slice(0, 10);
  const overdue = local !== "" && local < today;
  const hasValue = local !== "";

  return (
    <span
      className={cn("inline-flex items-center gap-1", className)}
      title={hasValue ? `Deadline: ${local}` : `Set ${idleLabel.toLowerCase()}`}
    >
      <CalendarClock
        className={cn(
          "h-3 w-3 shrink-0",
          hasValue
            ? overdue
              ? "text-trails-bad"
              : "text-trails-accent"
            : "text-trails-fg-dim",
        )}
      />
      {!hasValue && (
        <span className="text-[10px] text-trails-fg-dim">{idleLabel}</span>
      )}
      <input
        type="date"
        value={local}
        aria-label={idleLabel}
        onChange={(e) => {
          setLocal(e.target.value);
          onSave(e.target.value || null);
        }}
        className={cn(
          "rounded-md border bg-trails-bg-deep/60 px-1.5 py-0.5 text-[11px] leading-tight focus:outline-none focus:ring-1 focus:ring-trails-accent/40",
          hasValue
            ? overdue
              ? "border-trails-bad/50 text-trails-bad"
              : "border-trails-accent/40 text-trails-fg"
            : tone === "muted"
              ? "border-dashed border-trails-trim/40 text-trails-fg-dim"
              : "border-dashed border-trails-trim/50 text-trails-fg-dim",
        )}
      />
      {overdue && (
        <span className="font-display text-[9px] uppercase tracking-wider text-trails-bad">
          overdue
        </span>
      )}
      {hasValue && (
        <button
          type="button"
          title="Clear deadline"
          onClick={() => {
            setLocal("");
            onSave(null);
          }}
          className="shrink-0 rounded p-0.5 text-trails-fg-dim hover:text-trails-bad"
        >
          <X className="h-3 w-3" />
        </button>
      )}
      {saving && (
        <Loader2 className="h-3 w-3 shrink-0 animate-spin text-trails-fg-dim" />
      )}
      {justSaved && !saving && (
        <Check className="h-3 w-3 shrink-0 text-trails-good" />
      )}
    </span>
  );
}
