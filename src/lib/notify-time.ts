/**
 * Pure time-of-day helpers for notification gating.
 *
 * Notification reminder/quiet times are LOCAL wall-clock (what the user typed),
 * so all gating happens in local minutes-of-day. The client sends its
 * `Date.getTimezoneOffset()` (= UTC − local, e.g. −120 for UTC+2) and the
 * server converts the current UTC clock into the user's local minutes.
 *
 * Kept pure (no `new Date()` in the core) so the logic is unit-testable.
 */

/** "HH:MM" → minute-of-day (0..1439). */
export function hhmmToMinutes(hhmm: string): number {
  const [hh, mm] = hhmm.split(":").map(Number);
  return hh * 60 + mm;
}

/** A UTC minute-of-day converted to the user's local minute-of-day. */
export function toLocalMinutes(utcMinutes: number, tzOffsetMinutes: number): number {
  return (((utcMinutes - tzOffsetMinutes) % 1440) + 1440) % 1440;
}

/** Current local minute-of-day from the wall clock + the client's tz offset. */
export function localMinutesOfDay(
  tzOffsetMinutes: number,
  now: Date = new Date(),
): number {
  return toLocalMinutes(now.getUTCHours() * 60 + now.getUTCMinutes(), tzOffsetMinutes);
}

/** True once the local clock has passed the user-set "HH:MM" (local) today. */
export function nowPastHHMM(hhmm: string, localMinutes: number): boolean {
  return localMinutes >= hhmmToMinutes(hhmm);
}

/**
 * True if the local clock falls inside [start, end). The window may wrap past
 * midnight (e.g. 22:00 → 07:00). A zero-length window is never quiet.
 */
export function inQuietHours(
  startHHMM: string,
  endHHMM: string,
  localMinutes: number,
): boolean {
  const start = hhmmToMinutes(startHHMM);
  const end = hhmmToMinutes(endHHMM);
  if (start === end) return false;
  return start < end
    ? localMinutes >= start && localMinutes < end
    : localMinutes >= start || localMinutes < end;
}
