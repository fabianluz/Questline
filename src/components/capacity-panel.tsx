"use client";

import { useState } from "react";
import Link from "next/link";
import { Gauge, AlertTriangle, CheckCircle2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

/**
 * Capacity meter (Planning v2, Phase 5): available goal-hours (from the
 * schedule) vs planned milestone load (from estimatedHours), with weekly
 * overload bars. `compact` trims the controls + detail for the dashboard.
 */
export function CapacityPanel({ compact = false }: { compact?: boolean }) {
  const [weeks, setWeeks] = useState(compact ? 8 : 12);
  const [dailyCap, setDailyCap] = useState(2);

  const { data, isLoading } = trpc.schedule.capacity.useQuery({
    weeks,
    dailyCapHours: dailyCap,
    bucketBy: "week",
  });

  const util = data?.utilization ?? null;
  const pct = util != null ? Math.round(util * 100) : null;

  return (
    <section className="jrpg-panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="!m-0 !border-0 !p-0 flex items-center gap-2 font-display text-sm uppercase tracking-widest text-trails-accent">
          <Gauge className="h-4 w-4" />
          Capacity
          {data?.overloaded ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-trails-bad/15 px-2 py-0.5 text-[10px] font-medium text-trails-bad">
              <AlertTriangle className="h-3 w-3" /> Over capacity
            </span>
          ) : data && data.plannedHours > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-trails-good/15 px-2 py-0.5 text-[10px] font-medium text-trails-good">
              <CheckCircle2 className="h-3 w-3" /> On track
            </span>
          ) : null}
        </h2>

        {!compact && (
          <div className="flex items-center gap-3 text-xs">
            <label className="flex items-center gap-1.5 text-trails-fg-dim">
              Window
              <select
                value={weeks}
                onChange={(e) => setWeeks(Number(e.target.value))}
                className="rounded-md border border-trails-trim/40 bg-transparent px-2 py-1 text-trails-fg"
              >
                {[4, 8, 12, 24, 52].map((w) => (
                  <option key={w} value={w}>
                    {w} wks
                  </option>
                ))}
              </select>
            </label>
            <label
              className="flex items-center gap-1.5 text-trails-fg-dim"
              title="Hours per day you can realistically spend on milestone progress."
            >
              h/day
              <input
                type="number"
                min={0}
                max={24}
                step={0.5}
                value={dailyCap}
                onChange={(e) => setDailyCap(Math.max(0, Number(e.target.value) || 0))}
                className="w-16 rounded-md border border-trails-trim/40 bg-transparent px-2 py-1 text-right tabular-nums text-trails-fg"
              />
            </label>
          </div>
        )}
      </div>

      {isLoading || !data ? (
        <p className="mt-3 text-sm text-trails-fg-dim">Calculating…</p>
      ) : data.plannedHours === 0 && data.unscheduledHours === 0 ? (
        <p className="mt-3 text-sm text-trails-fg-dim">
          No planned hours in this window. Add{" "}
          <span className="text-trails-fg">estimated hours</span> to milestones
          (and start/achievement dates) to see whether your plan fits your time.
        </p>
      ) : data.plannedHours === 0 ? (
        <p className="mt-3 text-sm text-trails-fg-dim">
          Nothing dated in this window, but{" "}
          <span className="font-mono text-trails-info">{data.unscheduledHours}h</span>{" "}
          of work is <span className="text-trails-fg">unscheduled</span> — add
          start/achievement dates to place it on the timeline.
        </p>
      ) : (
        <>
          {/* Summary */}
          <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
            <span className="text-trails-fg-dim">
              Planned{" "}
              <span className="font-mono text-trails-fg">{data.plannedHours}h</span>
            </span>
            <span className="text-trails-fg-dim">
              Available{" "}
              <span className="font-mono text-trails-fg">{data.availableHours}h</span>
            </span>
            <span className="text-trails-fg-dim">
              Free{" "}
              <span
                className={cn(
                  "font-mono",
                  data.freeHours < 0 ? "text-trails-bad" : "text-trails-good",
                )}
              >
                {data.freeHours}h
              </span>
            </span>
            {pct != null && (
              <span className="text-trails-fg-dim">
                Load{" "}
                <span
                  className={cn(
                    "font-mono",
                    pct > 100
                      ? "text-trails-bad"
                      : pct >= 80
                        ? "text-trails-warn"
                        : "text-trails-good",
                  )}
                >
                  {pct}%
                </span>
              </span>
            )}
            {data.unscheduledHours > 0 && (
              <span
                className="text-trails-fg-dim"
                title="Work with no start/achievement date — it isn't placed in this window. Add dates to schedule it."
              >
                Unscheduled{" "}
                <span className="font-mono text-trails-info">{data.unscheduledHours}h</span>
              </span>
            )}
          </div>

          {/* Overall bar */}
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-trails-bg-glow">
            <div
              className={cn(
                "h-full rounded-full",
                pct != null && pct > 100
                  ? "bg-trails-bad"
                  : pct != null && pct >= 80
                    ? "bg-trails-warn"
                    : "bg-trails-good",
              )}
              style={{ width: `${Math.min(100, pct ?? 0)}%` }}
            />
          </div>

          {/* Weekly bucket bars */}
          <div className="mt-4">
            <div className="flex items-end gap-1" style={{ height: 56 }}>
              {data.buckets.map((b) => {
                const u = b.utilization ?? 0;
                const h = Math.max(3, Math.min(1.5, u) * 36);
                return (
                  <div
                    key={b.from}
                    className="group relative flex-1"
                    title={`${b.label}: ${b.plannedHours}h planned / ${b.availableHours}h available${b.overloaded ? " — over capacity" : ""}`}
                  >
                    <div
                      className={cn(
                        "w-full rounded-t-sm",
                        b.overloaded
                          ? "bg-trails-bad"
                          : (b.utilization ?? 0) >= 0.8
                            ? "bg-trails-warn"
                            : "bg-trails-good/70",
                      )}
                      style={{ height: h }}
                    />
                  </div>
                );
              })}
            </div>
            <p className="mt-1 text-[10px] text-trails-fg-dim">
              {data.from} → {data.to} · {data.buckets.filter((b) => b.overloaded).length} of{" "}
              {data.buckets.length} weeks over capacity
            </p>
          </div>

          {/* Top milestone load */}
          {!compact && data.items.length > 0 && (
            <div className="mt-4">
              <p className="mb-1.5 font-display text-[10px] uppercase tracking-widest text-trails-fg-dim">
                Biggest loads in window
              </p>
              <ul className="space-y-1">
                {data.items.slice(0, 6).map((it) => (
                  <li
                    key={it.id}
                    className="flex items-center justify-between gap-3 text-xs"
                  >
                    <span className="min-w-0 truncate text-trails-fg">
                      {it.label}
                      {it.epic ? (
                        <span className="text-trails-fg-dim"> · {it.epic}</span>
                      ) : null}
                      {it.undated ? (
                        <span className="text-trails-warn"> · undated</span>
                      ) : null}
                    </span>
                    <span className="shrink-0 font-mono text-trails-fg-dim">
                      {it.plannedInRange}h
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {compact && (
            <Link
              href="/schedule"
              className="mt-3 inline-block text-xs text-trails-accent hover:underline"
            >
              Tune capacity in Schedule →
            </Link>
          )}
        </>
      )}
    </section>
  );
}
