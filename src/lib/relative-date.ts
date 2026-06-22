/**
 * Pure helpers for human-friendly relative dates.
 *
 * Date columns in Questline are plain `YYYY-MM-DD` strings compared against the
 * *local* calendar day, so all math here is calendar-day based (no timezones).
 */

/** Whole days from today to an ISO date. Positive = future, negative = past. */
export function daysFromTodayISO(iso: string, now: Date = new Date()): number {
  const [y, m, d] = iso.split("-").map(Number);
  const target = Date.UTC(y, m - 1, d);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86_400_000);
}

/** "today" · "tomorrow" · "yesterday" · "in 3d" · "overdue 2d". */
export function relativeDateLabel(iso: string, now?: Date): string {
  const n = daysFromTodayISO(iso, now);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  if (n > 1) return `in ${n}d`;
  return `overdue ${Math.abs(n)}d`;
}

export type RelativeTone = "overdue" | "today" | "soon" | "later";

/** Bucket a date for color coding. ≤0 overdue/today, ≤7 soon, else later. */
export function relativeTone(iso: string, now?: Date): RelativeTone {
  const n = daysFromTodayISO(iso, now);
  if (n < 0) return "overdue";
  if (n === 0) return "today";
  if (n <= 7) return "soon";
  return "later";
}
