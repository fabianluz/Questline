/**
 * Structural validation + preview for imports (Planning v2, Phase 6).
 *
 * `summarizeImport` (json-shapes) already produces the count/list rows. This
 * module adds the *will-it-import-cleanly* layer: cross-reference checks that
 * Zod can't express (a milestone `requires` pointing at a milestone that isn't
 * in the file, a board node whose ref matches no entity, a start date after its
 * end date…), plus a milestone timeline for a quick Gantt-ish preview.
 *
 * Pure + deterministic so it can run client-side before any mutation.
 */

import type { ProfileJson, WorkspaceBundleJson, ChapterBoardJson } from "./json-shapes";

export interface ValidationIssue {
  level: "warn" | "info";
  message: string;
}

export interface TimelineItem {
  label: string;
  epic: string;
  start: string | null;
  end: string | null;
}

export interface ProfileAnalysis {
  issues: ValidationIssue[];
  timeline: TimelineItem[];
  constellationEdges: number;
  milestonePrereqEdges: number;
  totalEstimatedHours: number;
}

export interface BundleAnalysis extends ProfileAnalysis {
  boardChapters: number;
  boardCards: number;
  unresolvedBoardRefs: number;
}

function dupes(values: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const v of values) {
    if (!v) continue;
    if (seen.has(v)) dup.add(v);
    seen.add(v);
  }
  return [...dup];
}

export function analyzeProfile(p: ProfileJson): ProfileAnalysis {
  const issues: ValidationIssue[] = [];

  // --- identity sets ---
  const skillNames = new Set(p.skills.map((s) => s.name.toLowerCase()));
  // Skill refs (constellation `requires`) resolve by key OR name on import,
  // so accept either here — mirror dataio's resolveSkillId.
  const skillKeys = new Set(p.skills.flatMap((s) => (s.key ? [s.key] : [])));
  const milestoneKeys = new Set<string>();
  const milestoneTitles = new Set<string>();
  for (const e of p.epics) {
    for (const m of e.milestones) {
      if (m.key) milestoneKeys.add(m.key);
      milestoneTitles.add(m.title.toLowerCase());
    }
  }

  // --- duplicate keys (would collide on re-import) ---
  const dupEpicKeys = dupes(p.epics.map((e) => e.key));
  if (dupEpicKeys.length) issues.push({ level: "warn", message: `Duplicate epic keys: ${dupEpicKeys.join(", ")}` });
  const dupSkillKeys = dupes(p.skills.map((s) => s.key));
  if (dupSkillKeys.length) issues.push({ level: "warn", message: `Duplicate skill keys: ${dupSkillKeys.join(", ")}` });
  const dupQuestKeys = dupes(p.quests.map((q) => q.key));
  if (dupQuestKeys.length) issues.push({ level: "warn", message: `Duplicate quest keys: ${dupQuestKeys.join(", ")}` });
  const allMsKeys: (string | null | undefined)[] = [];
  for (const e of p.epics) for (const m of e.milestones) allMsKeys.push(m.key);
  const dupMsKeys = dupes(allMsKeys);
  if (dupMsKeys.length) issues.push({ level: "warn", message: `Duplicate milestone keys: ${dupMsKeys.join(", ")}` });

  // --- skill constellation edges + unknown refs ---
  let constellationEdges = 0;
  for (const s of p.skills) {
    for (const req of s.requires ?? []) {
      constellationEdges += 1;
      if (!skillKeys.has(req) && !skillNames.has(req.toLowerCase())) {
        issues.push({ level: "warn", message: `Skill "${s.name}" requires unknown skill "${req}"` });
      }
    }
  }

  // --- milestone prereqs + unknown refs, date sanity, effort ---
  let milestonePrereqEdges = 0;
  let totalEstimatedHours = 0;
  const timeline: TimelineItem[] = [];
  for (const e of p.epics) {
    for (const m of e.milestones) {
      totalEstimatedHours += m.estimatedHours ?? 0;
      for (const req of m.requires ?? []) {
        milestonePrereqEdges += 1;
        const known = milestoneKeys.has(req) || milestoneTitles.has(req.toLowerCase());
        if (!known) {
          issues.push({ level: "warn", message: `Milestone "${m.title}" requires unknown milestone "${req}"` });
        }
      }
      if (m.estimatedStartDate && m.estimatedAchievementDate && m.estimatedStartDate > m.estimatedAchievementDate) {
        issues.push({ level: "warn", message: `Milestone "${m.title}" starts after its achievement date` });
      }
      if (m.estimatedStartDate || m.estimatedAchievementDate) {
        timeline.push({
          label: m.title,
          epic: e.title,
          start: m.estimatedStartDate ?? null,
          end: m.estimatedAchievementDate ?? null,
        });
      }
    }
  }

  // --- quest date sanity ---
  for (const q of p.quests) {
    if (q.startDate && q.endDate && q.startDate > q.endDate) {
      issues.push({ level: "warn", message: `Quest "${q.title}" starts after its end date` });
    }
  }

  // --- goals referencing epics by title ---
  const epicTitles = new Set(p.epics.map((e) => e.title.toLowerCase()));
  for (const g of p.goals) {
    if (g.epic && !epicTitles.has(g.epic.toLowerCase())) {
      issues.push({ level: "info", message: `Goal "${g.name}" links epic "${g.epic}" not in this file (will be left unlinked)` });
    }
  }

  timeline.sort((a, b) => (a.start ?? a.end ?? "9999").localeCompare(b.start ?? b.end ?? "9999"));

  return { issues, timeline, constellationEdges, milestonePrereqEdges, totalEstimatedHours };
}

function analyzeBoardRefs(profile: ProfileJson, board: ChapterBoardJson) {
  const epicRefs = new Set<string>();
  const msRefs = new Set<string>();
  const questRefs = new Set<string>();
  const add = (set: Set<string>, ...vals: (string | null | undefined)[]) => {
    for (const v of vals) if (v) set.add(v.toLowerCase());
  };
  for (const e of profile.epics) {
    add(epicRefs, e.key, e.title);
    for (const m of e.milestones) add(msRefs, m.key, m.title);
  }
  for (const q of profile.quests) add(questRefs, q.key, q.title);

  let cards = 0;
  let unresolved = 0;
  const issues: ValidationIssue[] = [];
  for (const ch of board.chapters) {
    for (const n of ch.nodes) {
      cards += 1;
      const set = n.kind === "epic" ? epicRefs : n.kind === "milestone" ? msRefs : questRefs;
      const ref = (n.refKey ?? n.refTitle ?? "").toLowerCase();
      if (!ref || !set.has(ref)) {
        unresolved += 1;
        issues.push({
          level: "warn",
          message: `Board card (${n.kind}) "${n.refTitle ?? n.refKey ?? "?"}" in "${ch.title}" matches no entity in this bundle`,
        });
      }
    }
  }
  return { cards, unresolved, issues };
}

export function analyzeBundle(b: WorkspaceBundleJson): BundleAnalysis {
  const base = analyzeProfile(b.profile);
  if (!b.chapterBoard) {
    return { ...base, boardChapters: 0, boardCards: 0, unresolvedBoardRefs: 0 };
  }
  const board = analyzeBoardRefs(b.profile, b.chapterBoard);
  return {
    ...base,
    issues: [...base.issues, ...board.issues],
    boardChapters: b.chapterBoard.chapters.length,
    boardCards: board.cards,
    unresolvedBoardRefs: board.unresolved,
  };
}
