import { describe, it, expect } from "vitest";
import { packDay } from "./day-plan";

describe("packDay", () => {
  it("keeps fixed blocks and fills gaps with flexible items in order", () => {
    const out = packDay({
      wake: "07:00",
      sleep: "23:00",
      slotMinutes: 60,
      fixed: [
        { label: "Work AM", start: "08:00", end: "14:00", kind: "work" },
        { label: "Lunch", start: "14:00", end: "15:00", kind: "break" },
        { label: "Work PM", start: "15:00", end: "18:00", kind: "work" },
      ],
      flexible: [
        { title: "Gym", kind: "quest", minutes: 60 },
        { title: "Study Java", kind: "quest", minutes: 60 },
      ],
    });
    // Gym goes in the 07:00–08:00 morning gap.
    expect(out.find((b) => b.title === "Gym")).toMatchObject({ start: "07:00", end: "08:00", source: "flex" });
    // Study goes after work (18:00+).
    const study = out.find((b) => b.title === "Study Java")!;
    expect(study.source).toBe("flex");
    expect(study.start >= "18:00").toBe(true);
    // Fixed blocks are present + untouched.
    expect(out.find((b) => b.title === "Work AM")).toMatchObject({ start: "08:00", end: "14:00", source: "fixed" });
    // Output is sorted by start.
    const starts = out.map((b) => b.start);
    expect([...starts]).toEqual([...starts].sort());
  });

  it("clamps fixed blocks to the waking window", () => {
    const out = packDay({
      wake: "08:00",
      sleep: "22:00",
      fixed: [{ label: "Overnight", start: "06:00", end: "23:30", kind: "fixed" }],
      flexible: [],
    });
    expect(out[0]).toMatchObject({ start: "08:00", end: "22:00" });
  });

  it("stops placing flexible items when the day is full", () => {
    const out = packDay({
      wake: "09:00",
      sleep: "10:00", // only 60 min free
      slotMinutes: 45,
      fixed: [],
      flexible: [
        { title: "A", kind: "quest" },
        { title: "B", kind: "quest" },
        { title: "C", kind: "quest" },
      ],
    });
    const flex = out.filter((b) => b.source === "flex");
    expect(flex.length).toBe(1); // only A fits in the single 60-min gap
    expect(flex[0].title).toBe("A");
  });

  it("uses per-item minutes when provided", () => {
    const out = packDay({
      wake: "07:00",
      sleep: "23:00",
      fixed: [],
      flexible: [{ title: "Deep work", kind: "step", minutes: 120 }],
    });
    expect(out[0]).toMatchObject({ start: "07:00", end: "09:00" });
  });

  it("returns an empty plan with no fixed and no flexible", () => {
    expect(packDay({ fixed: [], flexible: [] })).toEqual([]);
  });
});
