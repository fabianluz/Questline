/**
 * Deterministic day planner (Daily Journal redesign).
 *
 * Lays fixed anchors (work segments from the schedule, gym, treatments…) onto a
 * wake→sleep timeline, then packs flexible items (today's quests + due steps)
 * into the gaps between them. Pure + offline + instant — the local LLM is an
 * optional "optimize" pass on top, not a requirement for a usable plan.
 *
 * Times are "HH:MM" 24h. Everything is same-day (wake < sleep).
 */

export interface FixedBlock {
  label: string;
  start: string; // "HH:MM"
  end: string;
  kind: string; // work | break | fixed | sleep | …
}

export interface FlexItem {
  title: string;
  kind: "quest" | "step";
  /** Desired minutes; falls back to slotMinutes. */
  minutes?: number;
}

export interface PlannedBlock {
  start: string;
  end: string;
  title: string;
  kind: string;
  source: "fixed" | "flex";
}

export interface PackDayInput {
  wake?: string; // default "07:00"
  sleep?: string; // default "23:00"
  fixed: FixedBlock[];
  flexible: FlexItem[];
  /** Default slot length for a flexible item with no explicit minutes. */
  slotMinutes?: number; // default 45
  /** Don't create a flex slot smaller than this. */
  minSlotMinutes?: number; // default 20
}

const toMin = (t: string): number => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const toHHMM = (mins: number): string => {
  const m = Math.max(0, Math.min(24 * 60, Math.round(mins)));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/**
 * Returns the day's blocks sorted by start. Fixed blocks keep their times;
 * flexible items fill the gaps in order until they run out or the day is full.
 */
export function packDay(input: PackDayInput): PlannedBlock[] {
  const wake = toMin(input.wake ?? "07:00");
  const sleep = toMin(input.sleep ?? "23:00");
  const slot = input.slotMinutes ?? 45;
  const minSlot = input.minSlotMinutes ?? 20;

  // Normalise + clamp fixed blocks to the waking window, drop invalid/empty.
  const fixed = input.fixed
    .map((b) => ({
      ...b,
      s: Math.max(wake, toMin(b.start)),
      e: Math.min(sleep, toMin(b.end)),
    }))
    .filter((b) => b.e > b.s)
    .sort((a, b) => a.s - b.s);

  const out: PlannedBlock[] = fixed.map((b) => ({
    start: toHHMM(b.s),
    end: toHHMM(b.e),
    title: b.label,
    kind: b.kind,
    source: "fixed" as const,
  }));

  // Build free gaps between fixed blocks (merging overlaps as we go).
  const gaps: { s: number; e: number }[] = [];
  let cursor = wake;
  for (const b of fixed) {
    if (b.s > cursor) gaps.push({ s: cursor, e: b.s });
    cursor = Math.max(cursor, b.e);
  }
  if (cursor < sleep) gaps.push({ s: cursor, e: sleep });

  // Greedily place flexible items into gaps, in order.
  let gi = 0;
  for (const item of input.flexible) {
    while (gi < gaps.length && gaps[gi].e - gaps[gi].s < minSlot) gi += 1;
    if (gi >= gaps.length) break;
    const g = gaps[gi];
    const want = item.minutes && item.minutes > 0 ? item.minutes : slot;
    const len = Math.min(want, g.e - g.s);
    out.push({
      start: toHHMM(g.s),
      end: toHHMM(g.s + len),
      title: item.title,
      kind: item.kind,
      source: "flex",
    });
    g.s += len + 5; // 5-min breather between flexible blocks
  }

  return out.sort((a, b) => toMin(a.start) - toMin(b.start));
}
