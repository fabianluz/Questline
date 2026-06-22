/**
 * Minimal iCalendar parser. Handles the slice of RFC 5545 we need to ingest
 * exports from Apple Calendar / Google Calendar / Outlook:
 *
 *   - VCALENDAR / VEVENT envelopes
 *   - UID, SUMMARY, DTSTART, DTEND
 *   - DTSTART;VALUE=DATE for all-day
 *   - DTSTART;TZID=... treated as local-wall (best effort: UTC fallback)
 *   - Line folding (CRLF + space/tab continuation)
 *
 * We intentionally DON'T handle RRULE expansion — recurring events are stored
 * as a single VEVENT at their original DTSTART. That's fine for our display
 * needs (show "the meeting" on the day it was created); we don't need a full
 * RRULE engine for the roadmap overlay.
 */

export type ParsedEvent = {
  uid: string;
  summary: string;
  startsAt: Date;
  endsAt: Date | null;
  allDay: boolean;
};

export function parseIcs(text: string): ParsedEvent[] {
  // Unfold continuation lines (RFC 5545 §3.1).
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  const lines = unfolded.split(/\r?\n/);

  const events: ParsedEvent[] = [];
  let current: Partial<ParsedEvent> & { rawStartParams?: string } = {};
  let inEvent = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line === "BEGIN:VEVENT") {
      inEvent = true;
      current = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (current.uid && current.summary && current.startsAt) {
        events.push({
          uid: current.uid,
          summary: current.summary,
          startsAt: current.startsAt,
          endsAt: current.endsAt ?? null,
          allDay: current.allDay ?? false,
        });
      }
      inEvent = false;
      current = {};
      continue;
    }
    if (!inEvent) continue;

    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const head = line.slice(0, colon);
    const value = line.slice(colon + 1);
    const [name, ...paramParts] = head.split(";");
    const params = paramParts.join(";");

    switch (name.toUpperCase()) {
      case "UID":
        current.uid = unescapeText(value);
        break;
      case "SUMMARY":
        current.summary = unescapeText(value);
        break;
      case "DTSTART": {
        const allDay = /VALUE=DATE\b/i.test(params);
        const parsed = parseIcsDateTime(value, allDay);
        if (parsed) {
          current.startsAt = parsed;
          current.allDay = allDay;
        }
        break;
      }
      case "DTEND": {
        const allDay = /VALUE=DATE\b/i.test(params);
        const parsed = parseIcsDateTime(value, allDay);
        if (parsed) current.endsAt = parsed;
        break;
      }
    }
  }
  return events;
}

function parseIcsDateTime(value: string, allDay: boolean): Date | null {
  // YYYYMMDD or YYYYMMDDTHHMMSS or YYYYMMDDTHHMMSSZ
  const m = value.match(
    /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z?))?$/,
  );
  if (!m) return null;
  const [, y, mo, d, hh, mm, ss, z] = m;
  if (allDay || !hh) {
    return new Date(Date.UTC(+y, +mo - 1, +d));
  }
  if (z === "Z") {
    return new Date(Date.UTC(+y, +mo - 1, +d, +hh, +mm, +ss));
  }
  // Floating local — treat as UTC. Good enough for display.
  return new Date(Date.UTC(+y, +mo - 1, +d, +hh, +mm, +ss));
}

function unescapeText(s: string): string {
  return s
    .replace(/\\\\/g, "\\")
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";");
}
