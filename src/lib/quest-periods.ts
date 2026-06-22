// Period helpers shared between client + server.
// All dates are UTC ISO strings (YYYY-MM-DD) so we never accidentally split
// a day across timezones.

export type Cadence = "daily" | "weekly";

export function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

export function startOfWeekUTC(d: Date = new Date()): string {
  // Monday-start. JS getUTCDay: 0=Sun..6=Sat.
  const day = d.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  const monday = new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate() - daysSinceMonday,
    ),
  );
  return monday.toISOString().slice(0, 10);
}

export function periodFor(cadence: Cadence, now: Date = new Date()): string {
  return cadence === "daily" ? now.toISOString().slice(0, 10) : startOfWeekUTC(now);
}

export function previousPeriod(cadence: Cadence, isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - (cadence === "daily" ? 1 : 7));
  return dt.toISOString().slice(0, 10);
}

/** Count consecutive periods ending now where the quest was completed. */
export function streakFor(
  cadence: Cadence,
  completionDates: Set<string>,
  now: Date = new Date(),
): number {
  let count = 0;
  let cursor = periodFor(cadence, now);
  while (completionDates.has(cursor)) {
    count += 1;
    cursor = previousPeriod(cadence, cursor);
  }
  return count;
}
