import { describe, it, expect } from "vitest";
import { EXAMPLE_PROFILE } from "@/lib/example-profile";
import { ProfileJson } from "@/lib/json-shapes";

describe("EXAMPLE_PROFILE", () => {
  it("validates against ProfileJson", () => {
    const result = ProfileJson.safeParse(EXAMPLE_PROFILE);
    if (!result.success) {
      // Surface the first few issues for a readable failure message.
      throw new Error(
        result.error.issues
          .slice(0, 8)
          .map((i) => `${i.path.join(".") || "(root)"} → ${i.message}`)
          .join("\n"),
      );
    }
    expect(result.success).toBe(true);
  });

  it("every milestone/quest skill ref exists in skills[]", () => {
    const parsed = ProfileJson.parse(EXAMPLE_PROFILE);
    const names = new Set(parsed.skills.map((s) => s.name));
    for (const s of parsed.skills)
      for (const req of s.requires ?? [])
        expect(names.has(req), `skill requires "${req}"`).toBe(true);
    for (const e of parsed.epics)
      for (const m of e.milestones)
        for (const sk of m.skills)
          expect(names.has(sk), `milestone "${m.title}" → skill "${sk}"`).toBe(
            true,
          );
    for (const q of parsed.quests)
      if (q.skill) expect(names.has(q.skill), `quest "${q.title}"`).toBe(true);
  });

  it("every epic category + goal epic ref resolves", () => {
    const parsed = ProfileJson.parse(EXAMPLE_PROFILE);
    const cats = new Set(parsed.categories.map((c) => c.name));
    const epics = new Set(parsed.epics.map((e) => e.title));
    for (const e of parsed.epics)
      if (e.category) expect(cats.has(e.category), e.title).toBe(true);
    for (const g of parsed.goals)
      if (g.epic) expect(epics.has(g.epic), g.name).toBe(true);
  });
});
