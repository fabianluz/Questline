import { describe, expect, it } from "vitest";
import {
  dateInRange,
  isWorkingDay,
  resolveWindow,
  weekdayIndex,
  workSegments,
  workMinutes,
  type ScheduleProfileInput,
} from "./schedule";

// 2026-06-22 is a Monday; 2026-06-27 a Saturday; 2026-06-28 a Sunday.
describe("weekdayIndex", () => {
  it("maps Monday→0 … Sunday→6", () => {
    expect(weekdayIndex("2026-06-22")).toBe(0); // Mon
    expect(weekdayIndex("2026-06-26")).toBe(4); // Fri
    expect(weekdayIndex("2026-06-27")).toBe(5); // Sat
    expect(weekdayIndex("2026-06-28")).toBe(6); // Sun
  });
});

describe("dateInRange", () => {
  it("treats null bounds as open", () => {
    expect(dateInRange("2026-07-01", null, null)).toBe(true);
    expect(dateInRange("2026-06-30", "2026-07-01", null)).toBe(false);
    expect(dateInRange("2026-09-16", null, "2026-09-15")).toBe(false);
    expect(dateInRange("2026-08-01", "2026-07-01", "2026-09-15")).toBe(true);
  });
});

const regular: ScheduleProfileInput = {
  name: "Regular Hours",
  startTime: "08:00",
  endTime: "18:00",
  days: "1111100",
  effectiveFrom: null,
  effectiveTo: null,
  priority: 0,
};
const summer: ScheduleProfileInput = {
  name: "Summer Hours",
  startTime: "08:00",
  endTime: "15:00",
  days: "1111100",
  effectiveFrom: "2026-07-01",
  effectiveTo: "2026-09-15",
  priority: 10,
};
const fallback = { startTime: "09:00", endTime: "17:00", days: "1111100" };

describe("resolveWindow", () => {
  it("uses the date-scoped Summer profile inside its range (beats Regular by priority)", () => {
    const r = resolveWindow("2026-08-03", { profiles: [regular, summer], fallback });
    expect(r).toMatchObject({ working: true, start: "08:00", end: "15:00", source: "profile", label: "Summer Hours" });
  });

  it("falls back to Regular outside the Summer range", () => {
    const r = resolveWindow("2026-10-05", { profiles: [regular, summer], fallback });
    expect(r).toMatchObject({ working: true, start: "08:00", end: "18:00", label: "Regular Hours" });
  });

  it("a weekend is a non-working day under a Mon–Fri profile", () => {
    const r = resolveWindow("2026-08-08", { profiles: [regular, summer], fallback }); // Saturday
    expect(r).toMatchObject({ working: false, source: "profile" });
  });

  it("a work-blocking calendar block overrides everything (holiday)", () => {
    const blocks = [{ title: "Japan trip", startDate: "2026-08-01", endDate: "2026-08-14", blocksWork: true }];
    const r = resolveWindow("2026-08-05", { profiles: [regular, summer], blocks, fallback });
    expect(r).toMatchObject({ working: false, source: "block", label: "Japan trip" });
  });

  it("a non-blocking block does NOT change the work window", () => {
    const blocks = [{ title: "Focus", startDate: "2026-08-05", endDate: "2026-08-05", blocksWork: false }];
    const r = resolveWindow("2026-08-05", { profiles: [summer], blocks, fallback });
    expect(r).toMatchObject({ working: true, start: "08:00", end: "15:00" });
  });

  it("uses the legacy fallback window when no profile covers the date", () => {
    const r = resolveWindow("2026-08-05", { profiles: [], fallback }); // Wednesday
    expect(r).toMatchObject({ working: true, start: "09:00", end: "17:00", source: "fallback", label: null });
  });

  it("returns not-working when nothing matches and no fallback", () => {
    expect(resolveWindow("2026-08-05", {})).toMatchObject({ working: false, source: "fallback" });
  });

  it("ignores inactive profiles", () => {
    const r = resolveWindow("2026-08-03", {
      profiles: [{ ...summer, active: false }, regular],
      fallback,
    });
    expect(r.label).toBe("Regular Hours");
  });

  it("isWorkingDay reflects holidays + weekends", () => {
    const blocks = [{ title: "Off", startDate: "2026-08-05", endDate: "2026-08-05", blocksWork: true }];
    expect(isWorkingDay("2026-08-05", { profiles: [summer], blocks, fallback })).toBe(false);
    expect(isWorkingDay("2026-08-06", { profiles: [summer], fallback })).toBe(true);
  });

  it("carries the profile's mid-day break into the resolved window", () => {
    const withBreak: ScheduleProfileInput = { ...regular, breakStart: "14:00", breakEnd: "15:00" };
    const r = resolveWindow("2026-10-05", { profiles: [withBreak] }); // Monday
    expect(r).toMatchObject({ working: true, start: "08:00", end: "18:00", breakStart: "14:00", breakEnd: "15:00" });
  });
});

describe("workSegments / workMinutes", () => {
  const win = (over: Partial<Parameters<typeof workSegments>[0]> = {}) =>
    ({ working: true, start: "08:00", end: "18:00", breakStart: null, breakEnd: null, source: "profile", label: "W", ...over }) as Parameters<typeof workSegments>[0];

  it("returns a single segment when there's no break", () => {
    expect(workSegments(win())).toEqual([{ start: "08:00", end: "18:00" }]);
    expect(workMinutes(win())).toBe(600);
  });

  it("splits around a mid-day break", () => {
    const w = win({ breakStart: "14:00", breakEnd: "15:00" });
    expect(workSegments(w)).toEqual([
      { start: "08:00", end: "14:00" },
      { start: "15:00", end: "18:00" },
    ]);
    expect(workMinutes(w)).toBe(540); // 600 − 60
  });

  it("ignores a break that falls outside the window", () => {
    expect(workSegments(win({ breakStart: "19:00", breakEnd: "20:00" }))).toEqual([
      { start: "08:00", end: "18:00" },
    ]);
  });

  it("returns nothing on a non-working day", () => {
    expect(workSegments({ working: false, start: null, end: null, breakStart: null, breakEnd: null, source: "profile", label: null })).toEqual([]);
    expect(workMinutes({ working: false, start: null, end: null, breakStart: null, breakEnd: null, source: "profile", label: null })).toBe(0);
  });
});
