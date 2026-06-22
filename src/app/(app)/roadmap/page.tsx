"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  Compass,
  HelpCircle,
  Lock,
  Pause,
  Search,
  X as XIcon,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { CapacityPanel } from "@/components/capacity-panel";

/**
 * /roadmap — month-axis timeline of every dated Milestone, grouped by Epic,
 * with parallel-execution support (milestones on the same vertical track).
 *
 * Under the Trails palette the outer panel uses the cascading
 * `.rounded-lg.border` chassis. Inner milestone bars deliberately use
 * `.rounded-sm` so the global cascade doesn't paint them blue — that lets
 * us keep each bar's category-color border-left stripe visible.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PX_PER_DAY = 6;
const MIN_PX_PER_DAY = 2;
const MAX_PX_PER_DAY = 16;
const MILESTONE_WIDTH = 170;
// Minimum render width for a start→end span bar so its label stays legible
// even when the planned window is only a few days (standard Gantt behavior).
const MIN_BAR = 120;
const TRACK_HEIGHT = 52;
const TRACK_GAP = 6;
const EPIC_TOP_PAD = 14;
const EPIC_BOTTOM_PAD = 12;
const MONTH_AXIS_HEIGHT = 36;
const SIDEBAR_WIDTH = 180;

function startOfMonthUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
function addMonthsUTC(d: Date, n: number) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}
function parseISO(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function fmtShort(d: Date) {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
function fmtMonth(d: Date) {
  return d.toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

const statusIcon: Record<
  "not_started" | "in_progress" | "completed" | "paused" | "abandoned",
  typeof Circle
> = {
  not_started: Circle,
  in_progress: Circle,
  completed: CheckCircle2,
  paused: Pause,
  abandoned: XIcon,
};

const statusIconClass: Record<
  "not_started" | "in_progress" | "completed" | "paused" | "abandoned",
  string
> = {
  not_started: "text-trails-fg-dim",
  in_progress: "text-trails-info",
  completed: "text-trails-good",
  paused: "text-trails-warn",
  abandoned: "text-trails-bad",
};

function rowHeightFor(tracks: number) {
  return (
    EPIC_TOP_PAD +
    tracks * TRACK_HEIGHT +
    Math.max(0, tracks - 1) * TRACK_GAP +
    EPIC_BOTTOM_PAD
  );
}

export default function RoadmapPage() {
  const { data, isLoading } = trpc.tree.get.useQuery();
  const [filterCategoryId, setFilterCategoryId] = useState<string>("");
  const [pxPerDay, setPxPerDay] = useState(DEFAULT_PX_PER_DAY);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const categoriesInUse = useMemo(() => {
    if (!data) return [];
    const map = new Map<
      string,
      { id: string; name: string; color: string }
    >();
    for (const e of data.epics) {
      if (e.category) map.set(e.category.id, e.category);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  const layout = useMemo(() => {
    if (!data) return null;

    const epicsForView = filterCategoryId
      ? data.epics.filter((e) => e.categoryId === filterCategoryId)
      : data.epics;
    const epicIds = new Set(epicsForView.map((e) => e.id));

    const dated = data.milestones.filter(
      (m) => !!m.estimatedAchievementDate && epicIds.has(m.epicId),
    );
    const undated = data.milestones.filter(
      (m) => !m.estimatedAchievementDate && epicIds.has(m.epicId),
    );

    if (dated.length === 0) {
      return { hasDates: false as const, undated };
    }

    // Axis spans from the earliest planned start (or achievement, when a
    // milestone has no start) through the latest achievement date.
    const allDates = dated.flatMap((m) => {
      const arr = [parseISO(m.estimatedAchievementDate!)];
      if (m.estimatedStartDate) arr.push(parseISO(m.estimatedStartDate));
      return arr;
    });
    const today = new Date(
      Date.UTC(
        new Date().getUTCFullYear(),
        new Date().getUTCMonth(),
        new Date().getUTCDate(),
      ),
    );
    let min = new Date(
      Math.min(...allDates.map((d) => d.getTime()), today.getTime()),
    );
    let max = new Date(
      Math.max(...allDates.map((d) => d.getTime()), today.getTime()),
    );
    min = startOfMonthUTC(min);
    max = addMonthsUTC(max, 1);

    const dateToX = (d: Date) =>
      ((d.getTime() - min.getTime()) / DAY_MS) * pxPerDay;

    const months: { x: number; label: string }[] = [];
    let cursor = new Date(min);
    while (cursor < max) {
      months.push({ x: dateToX(cursor), label: fmtMonth(cursor) });
      cursor = addMonthsUTC(cursor, 1);
    }
    const totalWidth = dateToX(max);

    // Geometry per milestone: a true start→end span when a start date exists,
    // otherwise a fixed-width card anchored at the achievement date.
    const geometry = (m: (typeof dated)[number]) => {
      const endX = dateToX(parseISO(m.estimatedAchievementDate!));
      const startX = m.estimatedStartDate
        ? dateToX(parseISO(m.estimatedStartDate))
        : null;
      if (startX !== null && startX < endX) {
        return {
          left: startX,
          width: Math.max(endX - startX, MIN_BAR),
          endX,
          hasSpan: true as const,
        };
      }
      return { left: endX, width: MILESTONE_WIDTH, endX, hasSpan: false as const };
    };

    const byEpic = new Map<string, typeof dated>();
    for (const m of dated) {
      const arr = byEpic.get(m.epicId) ?? [];
      arr.push(m);
      byEpic.set(m.epicId, arr);
    }

    type Placed = (typeof dated)[number] & {
      track: number;
      left: number;
      width: number;
      endX: number;
      hasSpan: boolean;
    };
    type EpicLayout = {
      epic: (typeof data.epics)[number];
      placed: Placed[];
      tracks: number;
      rowHeight: number;
    };

    const epicLayouts: EpicLayout[] = [];
    for (const epic of epicsForView) {
      const ms = byEpic.get(epic.id);
      if (!ms || ms.length === 0) continue;
      // Sort by where each bar begins so track-packing reads left → right.
      const withGeom = ms
        .map((m) => ({ m, g: geometry(m) }))
        .sort((a, b) => a.g.left - b.g.left);
      const trackEnds: number[] = [];
      const placed: Placed[] = [];
      for (const { m, g } of withGeom) {
        let track = trackEnds.findIndex((end) => end + 10 <= g.left);
        if (track === -1) {
          track = trackEnds.length;
          trackEnds.push(g.left + g.width);
        } else {
          trackEnds[track] = g.left + g.width;
        }
        placed.push({
          ...m,
          track,
          left: g.left,
          width: g.width,
          endX: g.endX,
          hasSpan: g.hasSpan,
        });
      }
      epicLayouts.push({
        epic,
        placed,
        tracks: trackEnds.length,
        rowHeight: rowHeightFor(trackEnds.length),
      });
    }

    return {
      hasDates: true as const,
      months,
      todayX: dateToX(today),
      totalWidth,
      epicLayouts,
      undated,
    };
  }, [data, filterCategoryId, pxPerDay]);

  // Center the viewport on "today" whenever the timeline (re)lays out.
  const todayX = layout && layout.hasDates ? layout.todayX : null;
  useEffect(() => {
    const el = scrollRef.current;
    if (el === null || todayX === null) return;
    el.scrollTo({ left: Math.max(0, todayX - el.clientWidth / 2), behavior: "smooth" });
  }, [todayX]);

  if (isLoading) {
    return <p className="text-sm text-trails-fg-dim">Loading roadmap...</p>;
  }
  if (!data || data.milestones.length === 0) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="flex items-center gap-2">
            <Compass className="h-5 w-5 text-trails-accent" />
            Roadmap
          </h1>
        </header>
        <div className="rounded-lg border border-dashed p-12 text-center">
          <Compass className="mx-auto h-8 w-8 text-trails-fg-dim" />
          <h2 className="!m-0 !border-0 !p-0 mt-3 text-base font-semibold">
            No milestones yet
          </h2>
          <p className="mt-2 text-sm text-trails-fg-dim">
            Create an Epic and add some Milestones first.
          </p>
          <Link
            href="/epics"
            className="mt-4 inline-flex items-center rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white"
          >
            Go to Epics →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2">
            <Compass className="h-5 w-5 text-trails-accent" />
            Roadmap
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-trails-fg-dim">
            Milestones span their estimated start → achievement date (bars
            without a start date show as a marker at the deadline). Cards
            stacked in the same row mean parallel execution. The vertical line
            is <strong className="text-trails-bad">today</strong>.
          </p>
        </div>
        <span
          title="Filter by Category to see only one life area, or visit /roadmap/[categoryId] to open a dedicated category view. Status icons match the Skill Tree."
          className="text-trails-info"
        >
          <HelpCircle className="h-4 w-4" />
        </span>
      </header>

      <CapacityPanel />

      <div className="flex flex-wrap items-center gap-3">
        <label className="font-display text-[10px] uppercase tracking-widest text-trails-fg-dim">
          Filter
        </label>
        <select
          value={filterCategoryId}
          onChange={(e) => setFilterCategoryId(e.target.value)}
          className="rounded-sm px-3 py-1.5 text-sm"
        >
          <option value="">All categories</option>
          {categoriesInUse.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {filterCategoryId && (
          <button
            type="button"
            onClick={() => setFilterCategoryId("")}
            className="text-xs text-trails-fg-dim hover:text-trails-accent"
          >
            Clear filter
          </button>
        )}

        <div className="ml-auto flex items-center gap-3">
          <label className="flex items-center gap-2" title="Zoom the timeline">
            <Search className="h-3.5 w-3.5 text-trails-fg-dim" />
            <input
              type="range"
              min={MIN_PX_PER_DAY}
              max={MAX_PX_PER_DAY}
              step={1}
              value={pxPerDay}
              onChange={(e) => setPxPerDay(Number(e.target.value))}
              className="h-1 w-28 accent-trails-accent"
              aria-label="Timeline zoom"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              const el = scrollRef.current;
              if (el && layout?.hasDates)
                el.scrollTo({
                  left: Math.max(0, layout.todayX - el.clientWidth / 2),
                  behavior: "smooth",
                });
            }}
            className="rounded-sm border border-trails-trim/60 px-2 py-1 font-display text-[10px] uppercase tracking-widest text-trails-fg-dim hover:text-trails-accent"
          >
            Jump to today
          </button>
        </div>
      </div>

      {!layout || !layout.hasDates ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-trails-fg-dim">
            None of the visible milestones have an estimated achievement date.
            Set one on any Epic detail page.
          </p>
          {layout && layout.undated.length > 0 && (
            <p className="mt-3 text-xs text-trails-fg-muted">
              Currently undated: {layout.undated.length}
            </p>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <div className="flex">
            {/* Sticky sidebar with epic labels.
                `border-r` (single-side) so the cascading rule doesn't
                paint it; we deliberately style it ourselves. */}
            <div
              className="shrink-0 border-r border-trails-trim/40 bg-trails-panel-dark/60"
              style={{ width: SIDEBAR_WIDTH }}
            >
              <div
                className="border-b border-trails-trim/40 bg-trails-bg-deep/50"
                style={{ height: MONTH_AXIS_HEIGHT }}
              />
              <div className="divide-y divide-trails-trim/15">
                {layout.epicLayouts.map(({ epic, rowHeight }) => (
                  <div
                    key={epic.id}
                    style={{ height: rowHeight }}
                    className="flex items-center gap-2 truncate px-3 text-xs"
                    title={epic.category?.name ?? "(no category)"}
                  >
                    {epic.category && (
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: epic.category.color }}
                      />
                    )}
                    <Link
                      href={`/epics/${epic.id}`}
                      className="truncate font-medium text-trails-fg hover:text-trails-accent"
                    >
                      {epic.title}
                    </Link>
                  </div>
                ))}
              </div>
            </div>

            {/* Scrolling canvas */}
            <div ref={scrollRef} className="flex-1 overflow-x-auto">
              <div
                className="relative"
                style={{ minWidth: Math.max(layout.totalWidth + 24, 600) }}
              >
                <div
                  className="relative border-b border-trails-trim/40 bg-trails-bg-deep/50"
                  style={{
                    height: MONTH_AXIS_HEIGHT,
                    width: layout.totalWidth,
                  }}
                >
                  {layout.months.map((m, i) => (
                    <div
                      key={i}
                      className="absolute top-0 h-full border-l border-trails-trim/30 pl-2 pt-1.5 font-display text-[11px] font-semibold uppercase tracking-wider text-trails-accent"
                      style={{ left: m.x, width: pxPerDay * 30 }}
                    >
                      {m.label}
                    </div>
                  ))}
                </div>

                <div className="relative">
                  <div
                    className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-trails-bad/80"
                    style={{ left: layout.todayX }}
                    title="Today"
                  >
                    <span className="absolute -left-4 top-1 rounded-sm bg-trails-bad px-1 font-display text-[9px] font-bold uppercase tracking-wider text-trails-bg-deep">
                      Now
                    </span>
                  </div>

                  <div className="divide-y divide-trails-trim/15">
                    {layout.epicLayouts.map(({ epic, placed, rowHeight }) => (
                      <div
                        key={epic.id}
                        className="relative"
                        style={{ height: rowHeight }}
                      >
                        {placed.map((m) => {
                          const Icon = statusIcon[m.status];
                          const y =
                            EPIC_TOP_PAD +
                            m.track * (TRACK_HEIGHT + TRACK_GAP);
                          const stripe =
                            epic.category?.color ?? "var(--trails-trim)";
                          return (
                            <Link
                              key={m.id}
                              href={`/epics/${m.epicId}`}
                              // Use `rounded-sm` not `-md` to dodge the
                              // cascading panel rule — we want each bar to
                              // keep its category stripe and own background.
                              className={cn(
                                "absolute flex flex-col gap-0.5 overflow-hidden rounded-sm bg-trails-panel-dark/95 px-2.5 py-1.5 text-xs text-trails-fg shadow-md transition-colors hover:bg-trails-panel hover:text-trails-accent-bright",
                                m.isLocked && "opacity-50",
                              )}
                              style={{
                                left: m.left,
                                top: y,
                                width: m.width,
                                height: TRACK_HEIGHT - 4,
                                borderLeft: `4px solid ${stripe}`,
                              }}
                              title={
                                m.hasSpan
                                  ? `${m.title} · ${m.status.replace("_", " ")} · ${fmtShort(parseISO(m.estimatedStartDate!))} → ${fmtShort(parseISO(m.estimatedAchievementDate!))}`
                                  : `${m.title} · ${m.status.replace("_", " ")} · ${fmtShort(parseISO(m.estimatedAchievementDate!))}`
                              }
                            >
                              {/* Deadline tick: the exact achievement date
                                  inside the span (a short window renders wider
                                  than its true length for legibility). */}
                              {m.hasSpan && (
                                <span
                                  className="pointer-events-none absolute bottom-0 top-0 w-0.5 bg-trails-accent/70"
                                  style={{
                                    left: Math.min(m.endX - m.left, m.width - 1),
                                  }}
                                  title="Estimated achievement date"
                                />
                              )}
                              <div className="flex items-center gap-1">
                                {m.isLocked ? (
                                  <Lock className="h-3 w-3 shrink-0 text-trails-fg-dim" />
                                ) : (
                                  <Icon
                                    className={cn(
                                      "h-3 w-3 shrink-0",
                                      statusIconClass[m.status],
                                    )}
                                  />
                                )}
                                <span
                                  className={cn(
                                    "truncate font-semibold",
                                    m.status === "completed" &&
                                      "line-through",
                                  )}
                                >
                                  {m.title}
                                </span>
                              </div>
                              <div className="truncate font-mono text-[10px] text-trails-fg-dim">
                                {m.hasSpan
                                  ? `${fmtShort(parseISO(m.estimatedStartDate!))} → ${fmtShort(parseISO(m.estimatedAchievementDate!))}`
                                  : fmtShort(parseISO(m.estimatedAchievementDate!))}
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {layout && layout.undated.length > 0 && (
        <section>
          <h2 className="!m-0 !border-0 !p-0 mb-2 text-sm">
            Undated · {layout.undated.length}
          </h2>
          <p className="mb-3 text-xs text-trails-fg-dim">
            These milestones don't have an estimated achievement date yet.
            They won't appear on the timeline until you set one.
          </p>
          <ul className="divide-y divide-trails-trim/20 rounded-lg border">
            {layout.undated.map((m) => (
              <li key={m.id} className="px-4 py-2 text-sm">
                <Link
                  href={`/epics/${m.epicId}`}
                  className="text-trails-fg hover:text-trails-accent"
                >
                  {m.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
