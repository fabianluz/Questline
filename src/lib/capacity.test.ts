import { describe, it, expect } from "vitest";
import {
  availableHoursForDay,
  plannedHoursInRange,
  daysInclusive,
  addDaysISO,
  computeCapacity,
  type ScheduleProfileInput,
} from "./capacity";

const weekdayProfile: ScheduleProfileInput = {
  name: "Work",
  startTime: "08:00",
  endTime: "18:00",
  days: "1111100", // Mon–Fri
};

describe("date helpers", () => {
  it("daysInclusive counts both endpoints", () => {
    expect(daysInclusive("2026-07-01", "2026-07-01")).toBe(1);
    expect(daysInclusive("2026-07-01", "2026-07-07")).toBe(7);
    expect(daysInclusive("2026-07-07", "2026-07-01")).toBe(0);
  });

  it("addDaysISO crosses month boundaries", () => {
    expect(addDaysISO("2026-07-31", 1)).toBe("2026-08-01");
    expect(addDaysISO("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe("availableHoursForDay", () => {
  const opts = { profiles: [weekdayProfile], dailyCapHours: 2, offDayCapHours: 4 };

  it("gives the daily budget on a working day", () => {
    // 2026-07-06 is a Monday
    expect(availableHoursForDay("2026-07-06", opts)).toBe(2);
  });

  it("gives the off-day budget on a weekend", () => {
    // 2026-07-11 is a Saturday
    expect(availableHoursForDay("2026-07-11", opts)).toBe(4);
  });

  it("zeroes out a holiday / time-off block by default", () => {
    const hol = {
      ...opts,
      blocks: [{ title: "Holiday", startDate: "2026-07-06", endDate: "2026-07-10", blocksWork: true }],
    };
    expect(availableHoursForDay("2026-07-06", hol)).toBe(0);
  });

  it("honours a custom holiday budget", () => {
    const hol = {
      ...opts,
      holidayCapHours: 6,
      blocks: [{ title: "Study leave", startDate: "2026-07-06", endDate: "2026-07-10", blocksWork: true }],
    };
    expect(availableHoursForDay("2026-07-06", hol)).toBe(6);
  });

  it("defaults off-day budget to the daily budget when unset", () => {
    expect(availableHoursForDay("2026-07-11", { profiles: [weekdayProfile], dailyCapHours: 3 })).toBe(3);
  });
});

describe("plannedHoursInRange", () => {
  it("counts undated work in full", () => {
    const r = plannedHoursInRange({ id: "a", label: "A", estimatedHours: 10 }, "2026-07-01", "2026-07-31");
    expect(r).toEqual({ hours: 10, undated: true });
  });

  it("returns zero for items with no/zero hours", () => {
    expect(plannedHoursInRange({ id: "a", label: "A", estimatedHours: 0 }, "2026-07-01", "2026-07-31").hours).toBe(0);
  });

  it("pro-rates by overlap fraction", () => {
    // 10-day span, fully inside range → full hours.
    const full = plannedHoursInRange(
      { id: "a", label: "A", estimatedHours: 20, startDate: "2026-07-01", endDate: "2026-07-10" },
      "2026-07-01",
      "2026-07-31",
    );
    expect(full.hours).toBe(20);

    // Half the span overlaps → half the hours. Span 1–10 (10 days), range starts 6 → overlap 6–10 (5 days).
    const half = plannedHoursInRange(
      { id: "a", label: "A", estimatedHours: 20, startDate: "2026-07-01", endDate: "2026-07-10" },
      "2026-07-06",
      "2026-07-31",
    );
    expect(half.hours).toBe(10);
  });

  it("returns zero when the item window misses the range", () => {
    const r = plannedHoursInRange(
      { id: "a", label: "A", estimatedHours: 20, startDate: "2026-08-01", endDate: "2026-08-10" },
      "2026-07-01",
      "2026-07-31",
    );
    expect(r.hours).toBe(0);
  });
});

describe("computeCapacity", () => {
  it("sums available vs planned and flags overload", () => {
    // One ISO week Mon 6 Jul – Sun 12 Jul: 5 working days @2h + 2 off days @4h = 18h.
    const report = computeCapacity({
      from: "2026-07-06",
      to: "2026-07-12",
      profiles: [weekdayProfile],
      dailyCapHours: 2,
      offDayCapHours: 4,
      items: [
        { id: "m1", label: "Big project", estimatedHours: 30, startDate: "2026-07-06", endDate: "2026-07-12" },
      ],
    });
    expect(report.availableHours).toBe(18);
    expect(report.plannedHours).toBe(30);
    expect(report.freeHours).toBe(-12);
    expect(report.overloaded).toBe(true);
    expect(report.workingDays).toBe(5);
    expect(report.offDays).toBe(2);
  });

  it("is not overloaded when planned fits", () => {
    const report = computeCapacity({
      from: "2026-07-06",
      to: "2026-07-12",
      profiles: [weekdayProfile],
      dailyCapHours: 2,
      offDayCapHours: 4,
      items: [{ id: "m1", label: "Small", estimatedHours: 6, startDate: "2026-07-06", endDate: "2026-07-12" }],
    });
    expect(report.overloaded).toBe(false);
    expect(report.utilization).toBe(0.33);
  });

  it("counts a holiday week as having less capacity", () => {
    const report = computeCapacity({
      from: "2026-07-06",
      to: "2026-07-12",
      profiles: [weekdayProfile],
      blocks: [{ title: "Holiday", startDate: "2026-07-06", endDate: "2026-07-12", blocksWork: true }],
      dailyCapHours: 2,
      offDayCapHours: 4,
      items: [],
    });
    expect(report.availableHours).toBe(0);
    expect(report.holidayDays).toBe(7);
    expect(report.utilization).toBeNull();
  });

  it("buckets the range by week with per-bucket overload", () => {
    const report = computeCapacity({
      from: "2026-07-06",
      to: "2026-07-19", // two ISO weeks
      profiles: [weekdayProfile],
      dailyCapHours: 2,
      offDayCapHours: 4,
      bucketBy: "week",
      items: [
        // Lands entirely in week 1 → that bucket overloads, week 2 doesn't.
        { id: "m1", label: "Crunch", estimatedHours: 30, startDate: "2026-07-06", endDate: "2026-07-12" },
      ],
    });
    expect(report.buckets).toHaveLength(2);
    expect(report.buckets[0].overloaded).toBe(true);
    expect(report.buckets[1].overloaded).toBe(false);
    expect(report.buckets[1].plannedHours).toBe(0);
  });

  it("sorts dated items by in-range load, descending", () => {
    const report = computeCapacity({
      from: "2026-07-01",
      to: "2026-07-31",
      dailyCapHours: 2,
      items: [
        { id: "small", label: "Small", estimatedHours: 3, startDate: "2026-07-01", endDate: "2026-07-31" },
        { id: "big", label: "Big", estimatedHours: 40, startDate: "2026-07-01", endDate: "2026-07-31" },
      ],
    });
    expect(report.items.map((i) => i.id)).toEqual(["big", "small"]);
  });

  it("routes undated work to unscheduled — never into the window load", () => {
    const report = computeCapacity({
      from: "2026-07-01",
      to: "2026-07-07",
      dailyCapHours: 2,
      items: [
        { id: "dated", label: "Dated", estimatedHours: 5, startDate: "2026-07-01", endDate: "2026-07-07" },
        { id: "future", label: "Future N1", estimatedHours: 3750 }, // undated
      ],
    });
    // The 3750h undated item must NOT inflate the 7-day window.
    expect(report.plannedHours).toBe(5);
    expect(report.overloaded).toBe(false);
    expect(report.items.map((i) => i.id)).toEqual(["dated"]);
    expect(report.unscheduledHours).toBe(3750);
    expect(report.unscheduledItems.map((i) => i.id)).toEqual(["future"]);
  });
});
