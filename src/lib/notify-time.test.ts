import { describe, expect, it } from "vitest";
import {
  hhmmToMinutes,
  inQuietHours,
  localMinutesOfDay,
  nowPastHHMM,
  toLocalMinutes,
} from "./notify-time";

describe("hhmmToMinutes", () => {
  it("parses HH:MM into minute-of-day", () => {
    expect(hhmmToMinutes("00:00")).toBe(0);
    expect(hhmmToMinutes("09:30")).toBe(570);
    expect(hhmmToMinutes("23:59")).toBe(1439);
  });
});

describe("toLocalMinutes", () => {
  // getTimezoneOffset() = UTC − local. UTC+2 (Madrid summer) → −120.
  it("shifts UTC forward for east-of-UTC zones (UTC+2)", () => {
    // 19:00 UTC → 21:00 local
    expect(toLocalMinutes(19 * 60, -120)).toBe(21 * 60);
  });

  it("shifts UTC back for west-of-UTC zones (UTC−5)", () => {
    // 02:00 UTC → 21:00 previous day local (wraps)
    expect(toLocalMinutes(2 * 60, 300)).toBe(21 * 60);
  });

  it("is a no-op at UTC", () => {
    expect(toLocalMinutes(13 * 60 + 37, 0)).toBe(13 * 60 + 37);
  });

  it("wraps across midnight in both directions", () => {
    // 23:30 UTC, UTC+2 → 01:30 local next day
    expect(toLocalMinutes(23 * 60 + 30, -120)).toBe(90);
    // 00:30 UTC, UTC−5 → 19:30 local previous day
    expect(toLocalMinutes(30, 300)).toBe(19 * 60 + 30);
  });
});

describe("localMinutesOfDay", () => {
  it("derives local minutes from a fixed UTC clock + offset", () => {
    const utc1900 = new Date("2026-06-21T19:00:00.000Z");
    expect(localMinutesOfDay(-120, utc1900)).toBe(21 * 60); // UTC+2 → 21:00
    expect(localMinutesOfDay(0, utc1900)).toBe(19 * 60); // UTC → 19:00
  });
});

describe("nowPastHHMM", () => {
  it("is true at and after the target local minute", () => {
    expect(nowPastHHMM("21:00", 21 * 60)).toBe(true);
    expect(nowPastHHMM("21:00", 21 * 60 + 5)).toBe(true);
  });
  it("is false before the target", () => {
    expect(nowPastHHMM("21:00", 20 * 60 + 59)).toBe(false);
  });
  it("regression: a 21:00 local reminder fires at 19:00 UTC in UTC+2 (not 23:00)", () => {
    const local = toLocalMinutes(19 * 60, -120); // 21:00
    expect(nowPastHHMM("21:00", local)).toBe(true);
    // At 17:00 UTC (19:00 local) it must NOT have fired yet.
    expect(nowPastHHMM("21:00", toLocalMinutes(17 * 60, -120))).toBe(false);
  });
});

describe("inQuietHours", () => {
  it("handles a same-day window", () => {
    expect(inQuietHours("09:00", "17:00", 12 * 60)).toBe(true);
    expect(inQuietHours("09:00", "17:00", 8 * 60)).toBe(false);
    expect(inQuietHours("09:00", "17:00", 17 * 60)).toBe(false); // end exclusive
  });

  it("handles a window that wraps past midnight", () => {
    expect(inQuietHours("22:00", "07:00", 23 * 60)).toBe(true);
    expect(inQuietHours("22:00", "07:00", 3 * 60)).toBe(true);
    expect(inQuietHours("22:00", "07:00", 12 * 60)).toBe(false);
    expect(inQuietHours("22:00", "07:00", 7 * 60)).toBe(false); // end exclusive
  });

  it("treats a zero-length window as never quiet", () => {
    expect(inQuietHours("08:00", "08:00", 8 * 60)).toBe(false);
  });
});
