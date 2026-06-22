import { describe, it, expect } from "vitest";
import {
  daysFromTodayISO,
  relativeDateLabel,
  relativeTone,
} from "@/lib/relative-date";

// Fixed "now": Wed 2026-06-10 (local). All cases anchor to this.
const NOW = new Date(2026, 5, 10, 9, 30);

describe("daysFromTodayISO", () => {
  it("is 0 for today regardless of clock time", () => {
    expect(daysFromTodayISO("2026-06-10", NOW)).toBe(0);
  });
  it("counts future and past days", () => {
    expect(daysFromTodayISO("2026-06-13", NOW)).toBe(3);
    expect(daysFromTodayISO("2026-06-08", NOW)).toBe(-2);
  });
  it("spans month boundaries", () => {
    expect(daysFromTodayISO("2026-07-01", NOW)).toBe(21);
  });
});

describe("relativeDateLabel", () => {
  it("uses words for adjacent days", () => {
    expect(relativeDateLabel("2026-06-10", NOW)).toBe("today");
    expect(relativeDateLabel("2026-06-11", NOW)).toBe("tomorrow");
    expect(relativeDateLabel("2026-06-09", NOW)).toBe("yesterday");
  });
  it("uses compact forms otherwise", () => {
    expect(relativeDateLabel("2026-06-13", NOW)).toBe("in 3d");
    expect(relativeDateLabel("2026-06-07", NOW)).toBe("overdue 3d");
  });
});

describe("relativeTone", () => {
  it("buckets correctly", () => {
    expect(relativeTone("2026-06-09", NOW)).toBe("overdue");
    expect(relativeTone("2026-06-10", NOW)).toBe("today");
    expect(relativeTone("2026-06-15", NOW)).toBe("soon");
    expect(relativeTone("2026-08-01", NOW)).toBe("later");
  });
});
