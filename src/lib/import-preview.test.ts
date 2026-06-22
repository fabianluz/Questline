import { describe, it, expect } from "vitest";
import { z } from "zod";
import { analyzeProfile, analyzeBundle } from "./import-preview";
import { ProfileJson, WorkspaceBundleJson } from "./json-shapes";

// Minimal valid profile we can extend per-test. Typed against the Zod *input*
// so schema defaults (status, tier, …) stay optional in the literals.
function profile(over: Partial<z.input<typeof ProfileJson>> = {}): ProfileJson {
  return ProfileJson.parse({
    version: 1,
    categories: [],
    skills: [],
    epics: [],
    quests: [],
    schedules: [],
    calendarBlocks: [],
    accounts: [],
    bills: [],
    goals: [],
    ...over,
  });
}

describe("analyzeProfile", () => {
  it("flags a milestone requiring an unknown milestone", () => {
    const p = profile({
      epics: [
        {
          title: "Epic A",
          status: "in_progress",
          milestones: [
            { key: "m1", title: "First", tier: 0, position: 0, skills: [], steps: [], resources: [], requires: ["ghost"] },
          ],
        },
      ],
    });
    const a = analyzeProfile(p);
    expect(a.milestonePrereqEdges).toBe(1);
    expect(a.issues.some((i) => i.message.includes('unknown milestone "ghost"'))).toBe(true);
  });

  it("resolves a milestone requires by key without warning", () => {
    const p = profile({
      epics: [
        {
          title: "Epic A",
          status: "in_progress",
          milestones: [
            { key: "base", title: "Base", tier: 0, position: 0, skills: [], steps: [], resources: [] },
            { key: "adv", title: "Advanced", tier: 1, position: 0, skills: [], steps: [], resources: [], requires: ["base"] },
          ],
        },
      ],
    });
    const a = analyzeProfile(p);
    expect(a.issues.filter((i) => i.message.includes("unknown milestone"))).toHaveLength(0);
  });

  it("flags unknown skill constellation refs + counts edges", () => {
    const p = profile({
      skills: [
        { name: "Reading", requires: ["Kana"] },
        { name: "Kana", requires: [] },
      ],
    });
    const a = analyzeProfile(p);
    expect(a.constellationEdges).toBe(1);
    expect(a.issues.filter((i) => i.message.includes("unknown skill"))).toHaveLength(0);

    const bad = analyzeProfile(profile({ skills: [{ name: "Reading", requires: ["Nope"] }] }));
    expect(bad.issues.some((i) => i.message.includes('unknown skill "Nope"'))).toBe(true);

    // requires resolves by key too (mirrors the importer), not just by name.
    const byKey = analyzeProfile(
      profile({
        skills: [
          { key: "kana", name: "Kana" },
          { name: "Kanji", requires: ["kana"] },
        ],
      }),
    );
    expect(byKey.issues.filter((i) => i.message.includes("unknown skill"))).toHaveLength(0);
  });

  it("flags start-after-end dates and sums estimated hours", () => {
    const p = profile({
      epics: [
        {
          title: "E",
          status: "in_progress",
          milestones: [
            {
              title: "Bad dates",
              tier: 0,
              position: 0,
              estimatedStartDate: "2026-09-01",
              estimatedAchievementDate: "2026-07-01",
              estimatedHours: 40,
              skills: [],
              steps: [],
              resources: [],
            },
          ],
        },
      ],
    });
    const a = analyzeProfile(p);
    expect(a.totalEstimatedHours).toBe(40);
    expect(a.issues.some((i) => i.message.includes("starts after its achievement date"))).toBe(true);
    expect(a.timeline).toHaveLength(1);
  });

  it("flags duplicate keys", () => {
    const p = profile({
      quests: [
        { key: "q", title: "A", cadence: "daily", xpReward: 10 },
        { key: "q", title: "B", cadence: "daily", xpReward: 10 },
      ],
    });
    const a = analyzeProfile(p);
    expect(a.issues.some((i) => i.message.includes("Duplicate quest keys"))).toBe(true);
  });

  it("sorts the timeline by start date", () => {
    const p = profile({
      epics: [
        {
          title: "E",
          status: "in_progress",
          milestones: [
            { title: "Late", tier: 0, position: 0, estimatedStartDate: "2026-10-01", skills: [], steps: [], resources: [] },
            { title: "Early", tier: 0, position: 1, estimatedStartDate: "2026-07-01", skills: [], steps: [], resources: [] },
          ],
        },
      ],
    });
    const a = analyzeProfile(p);
    expect(a.timeline.map((t) => t.label)).toEqual(["Early", "Late"]);
  });
});

describe("analyzeBundle", () => {
  it("flags board cards that match no entity in the profile", () => {
    const bundle = WorkspaceBundleJson.parse({
      kind: "workspace_bundle",
      version: 1,
      profile: {
        version: 1,
        epics: [{ title: "Real Epic", status: "in_progress", milestones: [] }],
      },
      chapterBoard: {
        version: 1,
        chapters: [
          {
            title: "Ch1",
            position: 0,
            nodes: [
              { kind: "epic", refTitle: "Real Epic", tier: 0, position: 0 },
              { kind: "epic", refTitle: "Phantom Epic", tier: 0, position: 1 },
            ],
          },
        ],
      },
    });
    const a = analyzeBundle(bundle);
    expect(a.boardChapters).toBe(1);
    expect(a.boardCards).toBe(2);
    expect(a.unresolvedBoardRefs).toBe(1);
    expect(a.issues.some((i) => i.message.includes("Phantom Epic"))).toBe(true);
  });

  it("handles a bundle with no board", () => {
    const bundle = WorkspaceBundleJson.parse({
      kind: "workspace_bundle",
      version: 1,
      profile: { version: 1, epics: [] },
    });
    const a = analyzeBundle(bundle);
    expect(a.boardChapters).toBe(0);
    expect(a.unresolvedBoardRefs).toBe(0);
  });
});
