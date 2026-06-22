/**
 * Pure schedule resolver (Planning v2, Phase 2).
 *
 * Answers "what is my work window on date D?" by layering, in priority order:
 *   1. a work-blocking Calendar Block (holiday / time-off) → no work that day
 *   2. the highest-priority Schedule Profile whose date range covers D
 *      (e.g. Summer hours 08:00–15:00 from 1 Jul–15 Sep)
 *   3. the legacy single work window (fallback)
 *
 * Kept free of DB/Date-now so it's deterministic + unit-testable. Dates are
 * "YYYY-MM-DD" strings (lexicographic compare == chronological); weekday masks
 * are 7 chars, index 0 = Monday (matching userPreference.workWindowDays).
 */

export interface ScheduleProfileInput {
  name: string;
  startTime: string; // "HH:MM"
  endTime: string;
  /** Optional mid-day break carved out of the window (e.g. lunch 14:00–15:00). */
  breakStart?: string | null;
  breakEnd?: string | null;
  days: string; // 7-char "1"/"0" mask, idx0 = Monday
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  priority?: number;
  active?: boolean;
}

export interface CalendarBlockInput {
  title: string;
  startDate: string;
  endDate: string;
  blocksWork?: boolean;
}

export interface WorkWindowFallback {
  startTime: string;
  endTime: string;
  days: string;
}

export interface ResolvedWindow {
  working: boolean;
  start: string | null; // "HH:MM" when working, else null
  end: string | null;
  /** Mid-day break carved out of the window (null when none / not working). */
  breakStart: string | null;
  breakEnd: string | null;
  /** Which layer decided this. */
  source: "block" | "profile" | "fallback";
  /** Block title or profile name (null for the fallback). */
  label: string | null;
}

/** Weekday index for a YYYY-MM-DD date, 0 = Monday … 6 = Sunday. */
export function weekdayIndex(dateISO: string): number {
  const [y, m, d] = dateISO.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun..6=Sat
  return (dow + 6) % 7;
}

/** Is `dateISO` within [fromISO, toISO]? Null bound = open on that side. */
export function dateInRange(
  dateISO: string,
  fromISO: string | null | undefined,
  toISO: string | null | undefined,
): boolean {
  if (fromISO && dateISO < fromISO) return false;
  if (toISO && dateISO > toISO) return false;
  return true;
}

function maskIncludes(days: string | undefined, idx: number): boolean {
  return !!days && days[idx] === "1";
}

export function resolveWindow(
  dateISO: string,
  opts: {
    profiles?: ScheduleProfileInput[];
    blocks?: CalendarBlockInput[];
    fallback?: WorkWindowFallback | null;
  },
): ResolvedWindow {
  const profiles = opts.profiles ?? [];
  const blocks = opts.blocks ?? [];
  const fallback = opts.fallback ?? null;
  const idx = weekdayIndex(dateISO);

  // 1. A work-blocking calendar block wins outright (holiday / time off).
  const block = blocks.find(
    (b) => b.blocksWork && dateInRange(dateISO, b.startDate, b.endDate),
  );
  if (block) {
    return { working: false, start: null, end: null, breakStart: null, breakEnd: null, source: "block", label: block.title };
  }

  // 2. Highest-priority active profile whose effective range covers the date.
  //    Tie-break: the one with the later (more specific) effectiveFrom.
  const applicable = profiles
    .filter(
      (p) =>
        p.active !== false &&
        dateInRange(dateISO, p.effectiveFrom ?? null, p.effectiveTo ?? null),
    )
    .sort(
      (a, b) =>
        (b.priority ?? 0) - (a.priority ?? 0) ||
        (b.effectiveFrom ?? "0000-00-00").localeCompare(a.effectiveFrom ?? "0000-00-00"),
    );
  const profile = applicable[0];
  if (profile) {
    return maskIncludes(profile.days, idx)
      ? {
          working: true,
          start: profile.startTime,
          end: profile.endTime,
          breakStart: profile.breakStart ?? null,
          breakEnd: profile.breakEnd ?? null,
          source: "profile",
          label: profile.name,
        }
      : {
          working: false,
          start: null,
          end: null,
          breakStart: null,
          breakEnd: null,
          source: "profile",
          label: profile.name,
        };
  }

  // 3. Legacy single work window.
  if (fallback && maskIncludes(fallback.days, idx)) {
    return {
      working: true,
      start: fallback.startTime,
      end: fallback.endTime,
      breakStart: null,
      breakEnd: null,
      source: "fallback",
      label: null,
    };
  }
  return { working: false, start: null, end: null, breakStart: null, breakEnd: null, source: "fallback", label: null };
}

/**
 * Split a resolved working window into its actual work segments, carving out
 * the mid-day break. "08:00–18:00 with a 14:00–15:00 break" → two segments
 * [08:00–14:00, 15:00–18:00]. No break (or break outside the window) → one
 * segment. Not working → none. Pure; used by the day planner + capacity.
 */
export function workSegments(win: ResolvedWindow): { start: string; end: string }[] {
  if (!win.working || !win.start || !win.end) return [];
  const { start, end, breakStart: bs, breakEnd: be } = win;
  if (bs && be && bs > start && be < end && bs < be) {
    return [
      { start, end: bs },
      { start: be, end },
    ];
  }
  return [{ start, end }];
}

/** Minutes of actual work in a resolved window (break excluded). */
export function workMinutes(win: ResolvedWindow): number {
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  return workSegments(win).reduce((s, seg) => s + (toMin(seg.end) - toMin(seg.start)), 0);
}

/** Convenience: is `dateISO` a working day under the given schedule? */
export function isWorkingDay(
  dateISO: string,
  opts: Parameters<typeof resolveWindow>[1],
): boolean {
  return resolveWindow(dateISO, opts).working;
}
