import { describe, it, expect } from "vitest";
import { levelFromXp, xpForLevel, levelProgress, XP_PER_MILESTONE } from "@/lib/xp";

describe("levelFromXp", () => {
  it("is 0 at or below zero XP", () => {
    expect(levelFromXp(0)).toBe(0);
    expect(levelFromXp(-50)).toBe(0);
  });

  it("follows the N² × 100 curve", () => {
    expect(levelFromXp(100)).toBe(1); // 1² × 100
    expect(levelFromXp(399)).toBe(1); // just under level 2
    expect(levelFromXp(400)).toBe(2); // 2² × 100
    expect(levelFromXp(900)).toBe(3);
    expect(levelFromXp(2500)).toBe(5);
    expect(levelFromXp(10_000)).toBe(10);
  });
});

describe("xpForLevel", () => {
  it("inverts the curve", () => {
    expect(xpForLevel(1)).toBe(100);
    expect(xpForLevel(5)).toBe(2500);
    expect(xpForLevel(10)).toBe(10_000);
  });
  it("uses XP_PER_MILESTONE as the unit", () => {
    expect(xpForLevel(1)).toBe(XP_PER_MILESTONE);
  });
});

describe("levelProgress", () => {
  it("reports remaining XP to the next level", () => {
    const p = levelProgress(100); // exactly level 1
    expect(p.level).toBe(1);
    expect(p.xpInLevel).toBe(0);
    expect(p.xpToNext).toBe(300); // 400 - 100
    expect(p.xpNeededForLevel).toBe(300);
    expect(p.progress).toBe(0);
  });

  it("computes a fractional progress mid-level", () => {
    const p = levelProgress(250); // between level 1 (100) and 2 (400)
    expect(p.level).toBe(1);
    expect(p.xpInLevel).toBe(150);
    expect(p.progress).toBeCloseTo(0.5, 5);
  });

  it("carries total XP through", () => {
    expect(levelProgress(1234).totalXp).toBe(1234);
  });
});
