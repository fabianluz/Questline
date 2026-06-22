// Minimal RFC 5545 iCalendar builder.
// Pure functions — no server-only imports, safe to unit-test.
//
// We hand-roll this instead of pulling a library because the surface we need
// is tiny (VCALENDAR + VEVENT + RRULE), and the off-the-shelf options either
// bring CommonJS-only code into Next.js or weigh more than the spec itself.

const CRLF = "\r\n";

/** Escape a free-text field per RFC 5545 §3.3.11. */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n/g, "\\n")
    .replace(/\n/g, "\\n");
}

/**
 * Fold a content line so no line exceeds 75 octets (RFC 5545 §3.1).
 * Continuation lines start with a single space.
 */
export function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let start = 0;
  // First chunk: 75 chars; subsequent: 74 chars (leading space takes 1).
  chunks.push(line.slice(0, 75));
  start = 75;
  while (start < line.length) {
    chunks.push(" " + line.slice(start, start + 74));
    start += 74;
  }
  return chunks.join(CRLF);
}

/** YYYY-MM-DD → YYYYMMDD (iCalendar DATE form). */
export function formatICSDate(isoDate: string): string {
  return isoDate.replace(/-/g, "");
}

/** Date → YYYYMMDDTHHMMSSZ (iCalendar DATE-TIME UTC). */
export function formatICSDateTime(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

export type VEventInput = {
  uid: string; // globally unique; we suffix with @questline.local
  /** All-day → ISO date "YYYY-MM-DD". For timed events, pass a Date. */
  start: string | Date;
  /** Optional ISO date or Date for the end. All-day events use DTEND as the *exclusive* next day per RFC; we omit if not given. */
  end?: string | Date;
  summary: string;
  description?: string;
  /** Raw RRULE body, e.g. "FREQ=DAILY" or "FREQ=WEEKLY;BYDAY=MO". */
  rrule?: string;
  /** Optional category strings — most clients ignore but Apple Calendar shows them. */
  categories?: string[];
};

/** Build a single VEVENT block (no trailing CRLF). */
export function buildVEvent(input: VEventInput, dtstamp: Date): string {
  const lines: string[] = [];
  lines.push("BEGIN:VEVENT");
  lines.push(`UID:${input.uid}`);
  lines.push(`DTSTAMP:${formatICSDateTime(dtstamp)}`);

  if (typeof input.start === "string") {
    lines.push(`DTSTART;VALUE=DATE:${formatICSDate(input.start)}`);
  } else {
    lines.push(`DTSTART:${formatICSDateTime(input.start)}`);
  }

  if (input.end) {
    if (typeof input.end === "string") {
      lines.push(`DTEND;VALUE=DATE:${formatICSDate(input.end)}`);
    } else {
      lines.push(`DTEND:${formatICSDateTime(input.end)}`);
    }
  }

  lines.push(`SUMMARY:${escapeText(input.summary)}`);
  if (input.description) {
    lines.push(`DESCRIPTION:${escapeText(input.description)}`);
  }
  if (input.rrule) {
    lines.push(`RRULE:${input.rrule}`);
  }
  if (input.categories?.length) {
    lines.push(`CATEGORIES:${input.categories.map(escapeText).join(",")}`);
  }
  lines.push("END:VEVENT");

  return lines.map(foldLine).join(CRLF);
}

/**
 * Build a complete VCALENDAR document. Sets NAME / X-WR-CALNAME so the user's
 * calendar app shows a friendly title, and a refresh hint so subscribers
 * re-fetch every hour rather than the client default (~6h on Apple).
 */
export function buildVCalendar(opts: {
  name: string;
  events: VEventInput[];
  refreshInterval?: string; // e.g. "PT1H"
}): string {
  const dtstamp = new Date();
  const refresh = opts.refreshInterval ?? "PT1H";

  const header = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Questline//Questline Local//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `NAME:${escapeText(opts.name)}`,
    `X-WR-CALNAME:${escapeText(opts.name)}`,
    `REFRESH-INTERVAL;VALUE=DURATION:${refresh}`,
    `X-PUBLISHED-TTL:${refresh}`,
  ];

  const body = opts.events.map((e) => buildVEvent(e, dtstamp));
  const footer = ["END:VCALENDAR"];

  return [...header.map(foldLine), ...body, ...footer].join(CRLF) + CRLF;
}
