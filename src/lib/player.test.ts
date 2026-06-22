import { describe, it, expect } from "vitest";
import { playerLevel, rankTitle } from "@/lib/player";

describe("rankTitle", () => {
  it("buckets every 5 levels", () => {
    expect(rankTitle(0)).toBe("Wanderer");
    expect(rankTitle(4)).toBe("Wanderer");
    expect(rankTitle(5)).toBe("Apprentice");
    expect(rankTitle(10)).toBe("Adept");
    expect(rankTitle(20)).toBe("Paladin");
  });
  it("clamps to the top rank", () => {
    expect(rankTitle(30)).toBe("Grandmaster");
    expect(rankTitle(999)).toBe("Grandmaster");
  });
});

describe("playerLevel", () => {
  it("is level 0 with no skills", () => {
    const s = playerLevel([]);
    expect(s.level).toBe(0);
    expect(s.totalXp).toBe(0);
    expect(s.rank).toBe("Wanderer");
    expect(s.skillCount).toBe(0);
  });

  it("sums XP across skills then applies the curve", () => {
    // 100 + 300 = 400 → level 2
    const s = playerLevel([{ totalXp: 100 }, { totalXp: 300 }]);
    expect(s.totalXp).toBe(400);
    expect(s.level).toBe(2);
    expect(s.skillCount).toBe(2);
  });

  it("tolerates missing/zero XP fields", () => {
    const s = playerLevel([{ totalXp: 0 }, { totalXp: 100 }]);
    expect(s.totalXp).toBe(100);
    expect(s.level).toBe(1);
  });
});
