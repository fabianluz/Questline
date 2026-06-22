"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared 4-step indicator across the /ai/* screens.
 *
 *   1 Notes  →  2 Restructure  →  3 Serialize  →  4 Commit
 *
 * Each step is a Link to its route so the user can backtrack freely. The
 * `current` step is highlighted, prior steps render as "done" pills, and
 * future steps render as inactive numbers.
 */

export type AiStep = "notes" | "restructure" | "serialize" | "commit";

const STEPS: { key: AiStep; label: string; href: string }[] = [
  { key: "notes", label: "Notes", href: "/ai/notes" },
  { key: "restructure", label: "Restructure", href: "/ai/restructure" },
  { key: "serialize", label: "Serialize", href: "/ai/serialize" },
  { key: "commit", label: "Commit", href: "/ai/commit" },
];

export function AiStepper({ current }: { current: AiStep }) {
  const currentIdx = STEPS.findIndex((s) => s.key === current);
  return (
    <nav
      aria-label="AI pipeline progress"
      className="flex flex-wrap items-center gap-2"
    >
      {STEPS.map((s, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <span key={s.key} className="flex items-center gap-2">
            <Link
              href={s.href}
              className={cn(
                "flex items-center gap-2 rounded-full border px-2.5 py-1 transition",
                active &&
                  "border-trails-accent bg-trails-accent/15 text-trails-accent-bright",
                done &&
                  "border-trails-good/60 bg-trails-good/10 text-trails-good hover:bg-trails-good/15",
                !done &&
                  !active &&
                  "border-trails-trim/40 text-trails-fg-dim hover:border-trails-accent hover:text-trails-accent",
              )}
            >
              <span
                className={cn(
                  "grid h-5 w-5 place-items-center rounded-full font-display text-[10px] font-bold",
                  active && "bg-trails-accent text-trails-bg-deep",
                  done && "bg-trails-good text-trails-bg-deep",
                  !done && !active && "border border-trails-trim/40",
                )}
              >
                {done ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              <span className="font-display text-[11px] uppercase tracking-widest">
                {s.label}
              </span>
            </Link>
            {i < STEPS.length - 1 && (
              <span
                className={cn(
                  "h-px w-6",
                  i < currentIdx
                    ? "bg-trails-good"
                    : "bg-trails-trim/30",
                )}
                aria-hidden
              />
            )}
          </span>
        );
      })}
    </nav>
  );
}
