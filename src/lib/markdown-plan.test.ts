import { describe, it, expect } from "vitest";
import { z } from "zod";
import { profileToMarkdown, bundleToMarkdown } from "./markdown-plan";
import { ProfileJson, WorkspaceBundleJson } from "./json-shapes";

function profile(over: Partial<z.input<typeof ProfileJson>> = {}): ProfileJson {
  return ProfileJson.parse({ version: 1, ...over });
}

describe("profileToMarkdown", () => {
  it("renders epics with keyed milestones, effort, steps and prereqs", () => {
    const md = profileToMarkdown(
      profile({
        epics: [
          {
            key: "jp",
            title: "Master Japanese",
            status: "in_progress",
            category: "Languages",
            milestones: [
              {
                key: "n5",
                title: "Pass JLPT N5",
                status: "in_progress",
                tier: 1,
                position: 0,
                estimatedHours: 120,
                estimatedStartDate: "2026-07-01",
                estimatedAchievementDate: "2026-09-20",
                requires: ["kana"],
                skills: ["Reading"],
                steps: [{ title: "Genki I", isCompleted: true, estimatedMinutes: 1800 }],
                resources: [{ kind: "book", label: "Genki I", acquired: true }],
              },
            ],
          },
        ],
      }),
    );
    expect(md).toContain("### Master Japanese `jp`");
    expect(md).toContain("- [ ] **Pass JLPT N5** `n5`");
    expect(md).toContain("~120h");
    expect(md).toContain("2026-07-01 → 2026-09-20");
    expect(md).toContain("requires: kana");
    expect(md).toContain("skills: Reading");
    expect(md).toContain("- [x] Genki I (~1800min)");
    expect(md).toContain("(book) Genki I");
  });

  it("renders quests with cadence, window and per-period target", () => {
    const md = profileToMarkdown(
      profile({
        quests: [
          { key: "java", title: "Study Java 1h", cadence: "daily", xpReward: 15, skill: "Java", startDate: "2026-07-13" },
          { title: "Gym", cadence: "weekly", xpReward: 20, timesPerPeriod: 4 },
        ],
      }),
    );
    expect(md).toContain("**[daily] Study Java 1h** `java`");
    expect(md).toContain("→ Java");
    expect(md).toContain("2026-07-13 → …");
    expect(md).toContain("4×/period");
  });

  it("renders schedules and calendar blocks", () => {
    const md = profileToMarkdown(
      profile({
        schedules: [
          { name: "Work", startTime: "08:00", endTime: "18:00", days: "1111100", priority: 0 },
        ],
        calendarBlocks: [
          { title: "Summer holiday", kind: "holiday", startDate: "2026-08-01", endDate: "2026-08-15", blocksWork: true },
        ],
      }),
    );
    expect(md).toContain("**Work** 08:00–18:00");
    expect(md).toContain("MTWTF··");
    expect(md).toContain("**Summer holiday** (holiday) 2026-08-01 → 2026-08-15 — no work");
  });

  it("omits sections with no content", () => {
    const md = profileToMarkdown(profile({}));
    expect(md).not.toContain("## Epics");
    expect(md).not.toContain("## Quests");
  });
});

describe("bundleToMarkdown", () => {
  it("includes a title, the profile, and the chapter board", () => {
    const bundle = WorkspaceBundleJson.parse({
      kind: "workspace_bundle",
      exportedAt: "2026-06-22T10:00:00.000Z",
      version: 1,
      profile: { version: 1, epics: [{ title: "Real Epic", status: "in_progress", milestones: [] }] },
      chapterBoard: {
        version: 1,
        chapters: [
          { title: "Chapter 1", position: 0, nodes: [{ kind: "epic", refTitle: "Real Epic", tier: 0, position: 0 }] },
        ],
      },
    });
    const md = bundleToMarkdown(bundle);
    expect(md).toContain("# Questline Master Plan");
    expect(md).toContain("_Exported 2026-06-22_");
    expect(md).toContain("### Real Epic");
    expect(md).toContain("## Chapter Board");
    expect(md).toContain("### Chapter 1");
    expect(md).toContain("- (epic) Real Epic [tier 0]");
    expect(md.endsWith("\n")).toBe(true);
  });

  it("omits the board section when there's no board", () => {
    const bundle = WorkspaceBundleJson.parse({
      kind: "workspace_bundle",
      version: 1,
      profile: { version: 1 },
    });
    const md = bundleToMarkdown(bundle);
    expect(md).not.toContain("## Chapter Board");
  });
});
