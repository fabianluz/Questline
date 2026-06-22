import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  SHAPES,
  CategoryJson,
  SkillJson,
  MilestoneJson,
  EpicJson,
  QuestJson,
  SchedulePeriodJson,
  CalendarBlockJson,
  AccountJson,
  BillJson,
  GoalJson,
  PreferencesJson,
  ProfileJson,
  ChapterBoardJson,
  WorkspaceBundleJson,
} from "@/lib/json-shapes";

// Pair every documented SHAPES example with the schema that should accept it.
const SCHEMA_BY_KIND: Record<string, z.ZodTypeAny> = {
  category: CategoryJson,
  skill: SkillJson,
  milestone: MilestoneJson,
  epic: EpicJson,
  quest: QuestJson,
  schedule: SchedulePeriodJson,
  calendarBlock: CalendarBlockJson,
  account: AccountJson,
  bill: BillJson,
  goal: GoalJson,
  preferences: PreferencesJson,
  profile: ProfileJson,
  chapterBoard: ChapterBoardJson,
  workspace: WorkspaceBundleJson,
};

describe("json-shapes examples", () => {
  it("registry and schema map cover the same kinds", () => {
    expect(Object.keys(SCHEMA_BY_KIND).sort()).toEqual(Object.keys(SHAPES).sort());
  });

  for (const [kind, shape] of Object.entries(SHAPES)) {
    it(`the documented "${kind}" example validates against its schema`, () => {
      const schema = SCHEMA_BY_KIND[kind];
      expect(schema, `no schema mapped for ${kind}`).toBeTruthy();
      const parsed = schema.parse(shape.example);
      // Round-trip: re-parsing the parsed output is stable.
      expect(schema.parse(parsed)).toEqual(parsed);
    });
  }
});

describe("ProfileJson", () => {
  it("fills array defaults for an empty profile (partial imports allowed)", () => {
    const parsed = ProfileJson.parse({});
    expect(parsed.version).toBe(1);
    expect(parsed.categories).toEqual([]);
    expect(parsed.epics).toEqual([]);
  });

  it("rejects a wrong-typed collection", () => {
    expect(ProfileJson.safeParse({ categories: "nope" }).success).toBe(false);
  });

  it("rejects a malformed nested epic", () => {
    expect(ProfileJson.safeParse({ epics: [{ notATitle: 1 }] }).success).toBe(false);
  });
});
