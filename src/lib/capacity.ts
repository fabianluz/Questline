/**
 * Pure capacity planner (Planning v2, Phase 5).
 *
 * Answers "do my planned milestone hours fit the time I actually have?" by
 * comparing, over a date range:
 *   • AVAILABLE hours — a daily goal-time budget, made schedule-aware: a day
 *     covered by a work-blocking Calendar Block (holiday / time-off) contributes
 *     `holidayCapHours` (default 0 — you're resting), a normal working day
 *     contributes `dailyCapHours`, and a non-working day (weekend / off) gets
 *     `offDayCapHours` (defaults to `dailyCapHours`).
 *   • PLANNED hours — the sum of milestone `estimatedHours`, pro-rated by how
 *     much of each milestone's [start, achievement] window overlaps the range.
 *     Undated milestones count in full (they have to land somewhere).
 *
 * Kept DB/Date-now free so it's deterministic + unit-testable. Dates are
 * "YYYY-MM-DD" (lexicographic == chronological). Reuses resolveWindow from
 * ./schedule so capacity and the day-planner agree on what a "work day" is.
 */

import {
  resolveWindow,
  type CalendarBlockInput,
  type ScheduleProfileInput,
  type WorkWindowFallback,
} from "./schedule";

export type { CalendarBlockInput, ScheduleProfileInput, WorkWindowFallback };

export interface CapacityItemInput {
  id: string;
  label: string;
  /** Owning epic title, for grouping/display. */
  epic?: string | null;
  estimatedHours: number;
  /** Milestone estimatedStartDate (YYYY-MM-DD) or null. */
  startDate?: string | null;
  /** Milestone estimatedAchievementDate (YYYY-MM-DD) or null. */
  endDate?: string | null;
}

export interface CapacityOptions {
  from: string; // YYYY-MM-DD, inclusive
  to: string; // YYYY-MM-DD, inclusive
  profiles?: ScheduleProfileInput[];
  blocks?: CalendarBlockInput[];
  fallback?: WorkWindowFallback | null;
  items?: CapacityItemInput[];
  /** Goal hours you can realistically spend on a normal working day. */
  dailyCapHours?: number;
  /** Goal hours on a non-working day (weekend / off). Defaults to dailyCapHours. */
  offDayCapHours?: number;
  /** Goal hours on a holiday / time-off day. Default 0 (you're resting). */
  holidayCapHours?: number;
  /** Bucket the range for a timeline view. */
  bucketBy?: "week" | "month";
}

export interface CapacityItem extends CapacityItemInput {
  /** Hours of this item that fall inside [from, to] (pro-rated). */
  plannedInRange: number;
  /** True when the item has no dates and was counted in full. */
  undated: boolean;
}

export interface CapacityBucket {
  from: string;
  to: string;
  label: string; // "Wk of 2026-07-06" | "2026-07"
  availableHours: number;
  plannedHours: number;
  overloaded: boolean;
  /** planned / available; null when there's no available time. */
  utilization: number | null;
}

export interface CapacityReport {
  from: string;
  to: string;
  availableHours: number;
  plannedHours: number;
  /** available − planned (negative = over capacity). */
  freeHours: number;
  /** planned / available; null when there's no available time. */
  utilization: number | null;
  overloaded: boolean;
  totalDays: number;
  workingDays: number;
  offDays: number;
  holidayDays: number;
  items: CapacityItem[];
  /** Undated work — has no placement, so it's NOT counted in the window load. */
  unscheduledHours: number;
  unscheduledItems: CapacityItem[];
  buckets: CapacityBucket[];
}

// --- date helpers (UTC, YYYY-MM-DD) ---------------------------------------

function toUTC(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDaysISO(iso: string, n: number): string {
  const d = toUTC(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUTC(d);
}

/** Inclusive day count from a→b (0 when b < a). */
export function daysInclusive(a: string, b: string): number {
  if (b < a) return 0;
  return Math.round((toUTC(b).getTime() - toUTC(a).getTime()) / 86_400_000) + 1;
}

function minISO(a: string, b: string): string {
  return a < b ? a : b;
}
function maxISO(a: string, b: string): string {
  return a > b ? a : b;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// --- available hours -------------------------------------------------------

type AvailOpts = Pick<
  CapacityOptions,
  | "profiles"
  | "blocks"
  | "fallback"
  | "dailyCapHours"
  | "offDayCapHours"
  | "holidayCapHours"
>;

/** Goal hours available on a single day under the schedule. */
export function availableHoursForDay(dateISO: string, opts: AvailOpts): number {
  const daily = opts.dailyCapHours ?? 2;
  const off = opts.offDayCapHours ?? daily;
  const holiday = opts.holidayCapHours ?? 0;
  const win = resolveWindow(dateISO, {
    profiles: opts.profiles,
    blocks: opts.blocks,
    fallback: opts.fallback ?? null,
  });
  // A blocking calendar block (holiday / time-off) wins → resting budget.
  if (win.source === "block") return holiday;
  return win.working ? daily : off;
}

function sumAvailable(from: string, to: string, opts: AvailOpts): number {
  let total = 0;
  for (let d = from; d <= to; d = addDaysISO(d, 1)) {
    total += availableHoursForDay(d, opts);
  }
  return total;
}

// --- planned hours ---------------------------------------------------------

/** Hours of one item that fall inside [from, to], pro-rated by date overlap. */
export function plannedHoursInRange(
  item: CapacityItemInput,
  from: string,
  to: string,
): { hours: number; undated: boolean } {
  const hours = item.estimatedHours;
  if (!hours || hours <= 0) return { hours: 0, undated: false };

  const start = item.startDate ?? item.endDate ?? null;
  const end = item.endDate ?? item.startDate ?? null;
  // Undated work has to happen sometime — count it in full against the range.
  if (!start || !end) return { hours, undated: true };

  const lo = start <= end ? start : end;
  const hi = start <= end ? end : start;
  const oStart = maxISO(lo, from);
  const oEnd = minISO(hi, to);
  if (oEnd < oStart) return { hours: 0, undated: false };

  const span = daysInclusive(lo, hi);
  const overlap = daysInclusive(oStart, oEnd);
  return { hours: (hours * overlap) / span, undated: false };
}

// --- buckets ---------------------------------------------------------------

/** Monday on/before the given date. */
function weekStart(iso: string): string {
  const dow = (toUTC(iso).getUTCDay() + 6) % 7; // 0 = Monday
  return addDaysISO(iso, -dow);
}

function bucketRanges(
  from: string,
  to: string,
  by: "week" | "month",
): { from: string; to: string; label: string }[] {
  const out: { from: string; to: string; label: string }[] = [];
  let cursor = from;
  while (cursor <= to) {
    let bEnd: string;
    let label: string;
    if (by === "week") {
      bEnd = addDaysISO(weekStart(cursor), 6);
      label = `Wk of ${weekStart(cursor)}`;
    } else {
      const [y, m] = cursor.split("-").map(Number);
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
      bEnd = `${cursor.slice(0, 7)}-${String(lastDay).padStart(2, "0")}`;
      label = cursor.slice(0, 7);
    }
    const segFrom = maxISO(cursor, from);
    const segTo = minISO(bEnd, to);
    out.push({ from: segFrom, to: segTo, label });
    cursor = addDaysISO(bEnd, 1);
  }
  return out;
}

// --- main ------------------------------------------------------------------

export function computeCapacity(opts: CapacityOptions): CapacityReport {
  const { from, to } = opts;
  const items = opts.items ?? [];

  let workingDays = 0;
  let offDays = 0;
  let holidayDays = 0;
  let totalDays = 0;
  for (let d = from; d <= to; d = addDaysISO(d, 1)) {
    totalDays += 1;
    const win = resolveWindow(d, {
      profiles: opts.profiles,
      blocks: opts.blocks,
      fallback: opts.fallback ?? null,
    });
    if (win.source === "block") holidayDays += 1;
    else if (win.working) workingDays += 1;
    else offDays += 1;
  }

  const availableHours = round1(sumAvailable(from, to, opts));

  // Dated items are pro-rated into the window; undated work has no placement,
  // so it's routed to a separate "unscheduled" total — never dumped into the
  // window (which would make a near-term view look catastrophically overloaded).
  const itemReports: CapacityItem[] = [];
  const unscheduledItems: CapacityItem[] = [];
  for (const it of items) {
    const { hours, undated } = plannedHoursInRange(it, from, to);
    if (undated) {
      unscheduledItems.push({ ...it, plannedInRange: round1(it.estimatedHours), undated: true });
    } else if (hours > 0) {
      itemReports.push({ ...it, plannedInRange: round1(hours), undated: false });
    }
  }
  itemReports.sort((a, b) => b.plannedInRange - a.plannedInRange);
  unscheduledItems.sort((a, b) => b.plannedInRange - a.plannedInRange);

  const plannedHours = round1(
    itemReports.reduce((s, it) => s + it.plannedInRange, 0),
  );
  const unscheduledHours = round1(
    unscheduledItems.reduce((s, it) => s + it.plannedInRange, 0),
  );

  const utilization =
    availableHours > 0 ? round2(plannedHours / availableHours) : null;

  const buckets: CapacityBucket[] = opts.bucketBy
    ? bucketRanges(from, to, opts.bucketBy).map((b) => {
        const avail = round1(sumAvailable(b.from, b.to, opts));
        const planned = round1(
          items.reduce((s, it) => {
            const r = plannedHoursInRange(it, b.from, b.to);
            return s + (r.undated ? 0 : r.hours);
          }, 0),
        );
        return {
          from: b.from,
          to: b.to,
          label: b.label,
          availableHours: avail,
          plannedHours: planned,
          overloaded: planned > avail,
          utilization: avail > 0 ? round1(planned / avail) : null,
        };
      })
    : [];

  return {
    from,
    to,
    availableHours,
    plannedHours,
    freeHours: round1(availableHours - plannedHours),
    utilization,
    overloaded: plannedHours > availableHours,
    totalDays,
    workingDays,
    offDays,
    holidayDays,
    items: itemReports,
    unscheduledHours,
    unscheduledItems,
    buckets,
  };
}
