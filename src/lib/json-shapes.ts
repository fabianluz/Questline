import { z } from "zod";

/**
 * Canonical JSON schemas for every importable / exportable entity in
 * Questline. Each shape comes with:
 *
 *   - `schema`  : a Zod schema used by the dataio tRPC router to validate
 *                 incoming JSON before insert.
 *   - `example` : a concrete, filled-in example the JsonHelpDialog shows the
 *                 user so they can paste it into an LLM and say "give me a
 *                 list of these".
 *   - `summary` : one-sentence human description.
 *
 * Design rules:
 *   - Output is plain JSON — no Date objects (ISO strings instead) and no
 *     Postgres-specific types.
 *   - IDs are optional on import (server creates fresh UUIDs unless the
 *     caller explicitly supplies one for cross-import refs).
 *   - Foreign keys (e.g. epic → category) use string names, not UUIDs, on
 *     import. The dataio router resolves names → IDs at insert time. This
 *     lets the user move data between accounts without keeping UUIDs in
 *     sync, and lets an LLM hand-write JSON without inventing real UUIDs.
 *
 * The single source of truth: this file. Anything that import/exports JSON
 * imports the matching schema from here.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

// `.nullable().optional()` produces an OPTIONAL property in the inferred
// input type (`field?: string | null`) so callers can omit the key entirely
// in JSON. `.or(z.null())` alone would require the key to exist with
// `null` or a string — too strict for hand-written / LLM-generated JSON.
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD")
  .nullable()
  .optional();

const isoDateTime = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), "must be a parseable ISO date")
  .nullable()
  .optional();

/**
 * Stable cross-reference key (a short slug like "ep_java" / "ms_n5"). Optional
 * and portable: lets the chapter board + skill `requires` target entities by a
 * rename-proof id, and lets re-import match → update in place (upsert) instead
 * of duplicating. Resolution order on import is always key → name/title → id.
 */
const keyField = z
  .string()
  .max(64)
  .regex(/^[a-zA-Z0-9_.:-]+$/, "key may use letters, numbers, _ . : -")
  .nullable()
  .optional();

/** "HH:MM" 24-hour time. */
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:MM (24h)");
/** Required "YYYY-MM-DD" date (non-null, unlike isoDate). */
const reqDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
/** 6-digit hex color. */
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "hex color e.g. #5b2a86");

// ---------------------------------------------------------------------------
// Category
// ---------------------------------------------------------------------------

export const CategoryJson = z.object({
  name: z.string().min(1).max(80),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "hex color e.g. #5b2a86"),
  icon: z.string().max(40).nullable().optional(),
});
export type CategoryJson = z.infer<typeof CategoryJson>;

const exampleCategory: CategoryJson = {
  name: "Languages",
  color: "#5b2a86",
  icon: "globe",
};

// ---------------------------------------------------------------------------
// Skill
// ---------------------------------------------------------------------------

export const SkillJson = z.object({
  /** Stable slug for re-import matching + being a `requires` target. */
  key: keyField,
  name: z.string().min(1).max(80),
  description: z.string().max(500).nullable().optional(),
  /** Optional "acquire this skill by" deadline (YYYY-MM-DD). */
  targetDate: isoDate,
  /** Domain grouping (Tech / Language / Body …) — colours the constellation. */
  domain: z.string().max(40).nullable().optional(),
  /** Names of prerequisite skills — the Skill Constellation edges. */
  requires: z.array(z.string()).optional(),
});
export type SkillJson = z.infer<typeof SkillJson>;

const exampleSkill: SkillJson = {
  name: "Japanese: Reading",
  description: "Decoding kanji + comprehension speed",
  targetDate: "2027-06-01",
  domain: "Language",
  requires: ["Japanese: Listening"],
};

// ---------------------------------------------------------------------------
// Milestone
// ---------------------------------------------------------------------------

export const MilestoneJson = z.object({
  /** Stable slug for re-import matching + being a chapter-board `refKey`. */
  key: keyField,
  title: z.string().min(1).max(200),
  description: z.string().max(1000).nullable().optional(),
  status: z
    .enum(["not_started", "in_progress", "completed", "paused", "abandoned"])
    .default("not_started"),
  tier: z.number().int().min(0).max(50).default(0),
  position: z.number().int().min(0).max(1000).default(0),
  /** Planned window: when work is expected to begin (YYYY-MM-DD). */
  estimatedStartDate: isoDate,
  estimatedAchievementDate: isoDate,
  /** Rough effort estimate in hours (feeds the capacity view). */
  estimatedHours: z.number().int().min(0).max(100000).nullable().optional(),
  /** Skill names to link (server resolves to skill IDs; missing → ignored). */
  skills: z.array(z.string()).default([]),
  /** Other milestones that must come first — by `key` (preferred) or title. */
  requires: z.array(z.string()).optional(),
  steps: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        description: z.string().max(500).nullable().optional(),
        isCompleted: z.boolean().default(false),
        /** Optional per-step deadline (YYYY-MM-DD). */
        dueDate: isoDate,
        /** Rough effort estimate in minutes (feeds the capacity view). */
        estimatedMinutes: z.number().int().min(0).max(100000).nullable().optional(),
      }),
    )
    .default([]),
  resources: z
    .array(
      z.object({
        kind: z.string().min(1).max(40),
        label: z.string().min(1).max(200),
        url: z.string().url().nullable().optional(),
        notes: z.string().max(500).nullable().optional(),
        acquired: z.boolean().default(false),
      }),
    )
    .default([]),
});
export type MilestoneJson = z.infer<typeof MilestoneJson>;

const exampleMilestone: MilestoneJson = {
  key: "pass-jlpt-n5",
  title: "Pass JLPT N5",
  description: "Reading + listening at the beginner-cert threshold",
  status: "in_progress",
  tier: 2,
  position: 0,
  estimatedStartDate: "2026-07-01",
  estimatedAchievementDate: "2026-09-20",
  estimatedHours: 120,
  skills: ["Japanese: Reading", "Japanese: Listening"],
  // Other milestones (by `key`) that must be done first.
  requires: ["learn-hiragana-katakana"],
  steps: [
    {
      title: "Memorize the ~100 N5 kanji",
      isCompleted: true,
      dueDate: "2026-07-01",
      estimatedMinutes: 1800,
    },
    {
      title: "Finish Genki I exercises",
      isCompleted: false,
      dueDate: "2026-08-15",
      estimatedMinutes: 2400,
    },
  ],
  resources: [
    {
      kind: "book",
      label: "Genki I",
      url: "https://genki3.japantimes.co.jp",
      acquired: true,
    },
  ],
};

// ---------------------------------------------------------------------------
// Epic
// ---------------------------------------------------------------------------

export const EpicJson = z.object({
  /** Stable slug for re-import matching + being a chapter-board `refKey`. */
  key: keyField,
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  status: z
    .enum(["not_started", "in_progress", "completed", "paused", "abandoned"])
    .default("not_started"),
  targetDate: isoDate,
  /** Category name (server resolves to category ID, creates if missing). */
  category: z.string().nullable().optional(),
  milestones: z.array(MilestoneJson).default([]),
});
export type EpicJson = z.infer<typeof EpicJson>;

const exampleEpic: EpicJson = {
  title: "Master Japanese",
  description: "Conversational fluency + read native prose without help",
  status: "in_progress",
  targetDate: "2028-04-01",
  category: "Languages",
  milestones: [exampleMilestone],
};

// ---------------------------------------------------------------------------
// Quest (daily / weekly / one-off side quest)
// ---------------------------------------------------------------------------

export const QuestJson = z.object({
  /** Stable slug for re-import matching + being a chapter-board `refKey`. */
  key: keyField,
  title: z.string().min(1).max(120),
  description: z.string().max(500).nullable().optional(),
  cadence: z.enum(["daily", "weekly", "one_off"]),
  xpReward: z.number().int().min(0).max(1000),
  /** Skill name to grant XP to on completion. */
  skill: z.string().nullable().optional(),
  difficulty: z.enum(["trivial", "normal", "hard"]).nullable().optional(),
  expiresAt: isoDateTime,
  /** Active window for a recurring quest (e.g. "Java 1h" starts 2026-07-13). */
  startDate: isoDate,
  endDate: isoDate,
  /** Target completions per period (e.g. gym 4×/week). Null = single tick. */
  timesPerPeriod: z.number().int().min(1).max(100).nullable().optional(),
});
export type QuestJson = z.infer<typeof QuestJson>;

const exampleQuest: QuestJson = {
  title: "Study Java 1h",
  description: "Daily habit — only starts once the exam sprint is over",
  cadence: "daily",
  xpReward: 15,
  skill: "Java",
  difficulty: null,
  expiresAt: null,
  startDate: "2026-07-13",
  endDate: null,
  timesPerPeriod: null,
};

const exampleWeeklyQuest: QuestJson = {
  title: "Gym",
  description: "Strength training",
  cadence: "weekly",
  xpReward: 20,
  skill: null,
  difficulty: null,
  expiresAt: null,
  startDate: null,
  endDate: null,
  timesPerPeriod: 4,
};

const exampleSideQuest: QuestJson = {
  title: "Deep-clean the garage",
  cadence: "one_off",
  xpReward: 40,
  skill: null,
  difficulty: "hard",
  expiresAt: "2026-06-15T00:00:00.000Z",
};

// ---------------------------------------------------------------------------
// Inventory: account / bill / goal
// ---------------------------------------------------------------------------

export const AccountJson = z.object({
  name: z.string().min(1).max(120),
  kind: z.enum(["asset", "liability"]),
  category: z.string().max(40).default("other"),
  balanceCents: z.number().int(),
  currency: z.string().min(1).max(8).default("EUR"),
  notes: z.string().max(500).nullable().optional(),
});
export type AccountJson = z.infer<typeof AccountJson>;

const exampleAccount: AccountJson = {
  name: "Main Checking",
  kind: "asset",
  category: "checking",
  balanceCents: 248_50, // €2,485.00 stored as integer cents
  currency: "EUR",
  notes: null,
};

export const BillJson = z.object({
  name: z.string().min(1).max(120),
  amountCents: z.number().int().min(0),
  currency: z.string().min(1).max(8).default("EUR"),
  cadence: z.enum(["weekly", "monthly", "yearly"]).default("monthly"),
  category: z.string().max(40).default("other"),
  nextDueDate: isoDate,
});
export type BillJson = z.infer<typeof BillJson>;

const exampleBill: BillJson = {
  name: "Internet",
  amountCents: 49_99,
  currency: "EUR",
  cadence: "monthly",
  category: "utilities",
  nextDueDate: "2026-06-15",
};

export const GoalJson = z.object({
  name: z.string().min(1).max(120),
  targetCents: z.number().int().min(0),
  currentCents: z.number().int().min(0).default(0),
  currency: z.string().min(1).max(8).default("EUR"),
  targetDate: isoDate,
  /** Epic title to link to (server resolves to epic ID; missing → ignored). */
  epic: z.string().nullable().optional(),
  status: z.enum(["active", "achieved", "abandoned"]).default("active"),
  notes: z.string().max(500).nullable().optional(),
});
export type GoalJson = z.infer<typeof GoalJson>;

const exampleGoal: GoalJson = {
  name: "Netherlands relocation fund",
  targetCents: 10_000_00,
  currentCents: 1_240_00,
  currency: "EUR",
  targetDate: "2027-01-01",
  epic: "Move to the Netherlands",
  status: "active",
  notes: null,
};

// ---------------------------------------------------------------------------
// Preferences + Debuff + Retrospective (round-trip only; no example needed
// for LLM-generation since these are app-state and not user-authored)
// ---------------------------------------------------------------------------

export const PreferencesJson = z.object({
  workWindowStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  workWindowEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  workWindowDays: z.string().regex(/^[01]{7}$/),
  defaultStepDurationMin: z.number().int().min(10).max(480),
  /** Selected local AI model (Ollama ref). Optional so older backups import fine. */
  aiModel: z.string().max(120).nullable().optional(),
});
export type PreferencesJson = z.infer<typeof PreferencesJson>;

const examplePreferences: PreferencesJson = {
  workWindowStart: "09:00",
  workWindowEnd: "17:00",
  workWindowDays: "1111100", // Mon-Fri
  defaultStepDurationMin: 45,
};

// ---------------------------------------------------------------------------
// Schedule profile + calendar block (time-block scheduling)
// ---------------------------------------------------------------------------

export const SchedulePeriodJson = z.object({
  key: keyField,
  name: z.string().min(1).max(80),
  startTime: hhmm,
  endTime: hhmm,
  /** Optional mid-day break carved out of the window (e.g. lunch 14:00–15:00). */
  breakStart: hhmm.nullable().optional(),
  breakEnd: hhmm.nullable().optional(),
  /** 7-char "1"/"0" mask, index 0 = Monday … 6 = Sunday. */
  days: z.string().regex(/^[01]{7}$/, "7-char Mon..Sun mask"),
  /** Effective window (inclusive). Null = open-ended on that side. */
  effectiveFrom: isoDate,
  effectiveTo: isoDate,
  color: hexColor.nullable().optional(),
  /** Higher wins when two profiles cover the same date. */
  priority: z.number().int().min(0).max(1000).default(0),
  active: z.boolean().default(true),
  notes: z.string().max(500).nullable().optional(),
});
export type SchedulePeriodJson = z.infer<typeof SchedulePeriodJson>;

const exampleSchedule: SchedulePeriodJson = {
  key: "sched_summer",
  name: "Summer Hours",
  startTime: "08:00",
  endTime: "15:00",
  days: "1111100",
  effectiveFrom: "2026-07-01",
  effectiveTo: "2026-09-15",
  color: "#2e7d4f",
  priority: 10,
  active: true,
  notes: null,
};

export const CalendarBlockJson = z.object({
  key: keyField,
  title: z.string().min(1).max(120),
  kind: z
    .enum(["holiday", "time_off", "travel", "focus", "busy", "custom"])
    .default("custom"),
  startDate: reqDate,
  endDate: reqDate,
  allDay: z.boolean().default(true),
  startTime: hhmm.nullable().optional(),
  endTime: hhmm.nullable().optional(),
  /** When true, this span suppresses work entirely (holiday / time off). */
  blocksWork: z.boolean().default(false),
  color: hexColor.nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});
export type CalendarBlockJson = z.infer<typeof CalendarBlockJson>;

const exampleCalendarBlock: CalendarBlockJson = {
  key: "block_japan",
  title: "Japan trip",
  kind: "travel",
  startDate: "2026-08-01",
  endDate: "2026-08-14",
  allDay: true,
  startTime: null,
  endTime: null,
  blocksWork: true,
  color: null,
  notes: "No work — holiday",
};

// ---------------------------------------------------------------------------
// Chapter board (JRPG-style phase planner)
//
// Round-trip note: refId is included on export so a same-DB re-import preserves
// exact entity links; refKey (stable slug) is the preferred portable reference;
// refTitle is the last-resort fallback. Import resolves in order
// refId → refKey → refTitle (scoped to the user). At least one must resolve at
// import time, or the node is skipped with a "dangling reference" entry on the
// import report.
// ---------------------------------------------------------------------------

export const ChapterBoardNodeJson = z.object({
  kind: z.enum(["epic", "milestone", "quest"]),
  refId: z.string().uuid().nullable().optional(),
  /** Stable slug of the referenced entity — preferred over refTitle (rename-proof). */
  refKey: keyField,
  refTitle: z.string().min(1).max(200).nullable().optional(),
  tier: z.number().int().min(0).max(50).default(0),
  position: z.number().int().min(0).max(1000).default(0),
  notes: z.string().max(500).nullable().optional(),
});
export type ChapterBoardNodeJson = z.infer<typeof ChapterBoardNodeJson>;

export const ChapterBoardChapterJson = z.object({
  title: z.string().min(1).max(80),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "hex color e.g. #5b2a86")
    .nullable()
    .optional(),
  notes: z.string().max(500).nullable().optional(),
  position: z.number().int().min(0).max(1000).default(0),
  nodes: z.array(ChapterBoardNodeJson).default([]),
});
export type ChapterBoardChapterJson = z.infer<typeof ChapterBoardChapterJson>;

export const ChapterBoardJson = z.object({
  exportedAt: z.string().optional(),
  version: z.literal(1).default(1),
  chapters: z.array(ChapterBoardChapterJson).default([]),
});
export type ChapterBoardJson = z.infer<typeof ChapterBoardJson>;

const exampleChapterBoard: ChapterBoardJson = {
  exportedAt: "2026-06-06T12:00:00.000Z",
  version: 1,
  chapters: [
    {
      title: "Chapter 1: Foundations",
      color: "#5b2a86",
      notes: "Get the basics down before pushing for results.",
      position: 0,
      nodes: [
        {
          kind: "epic",
          refTitle: "Master Japanese",
          tier: 0,
          position: 0,
          notes: "Lock in daily study habit first.",
        },
        {
          kind: "milestone",
          refTitle: "Pass JLPT N5",
          tier: 1,
          position: 0,
          notes: null,
        },
      ],
    },
    {
      title: "Chapter 2: Push",
      color: "#a23a3a",
      notes: null,
      position: 1,
      nodes: [
        {
          kind: "quest",
          refTitle: "Read 10 pages",
          tier: 0,
          position: 0,
          notes: "Keep momentum.",
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Full profile bundle
// ---------------------------------------------------------------------------

export const ProfileJson = z.object({
  exportedAt: z.string().optional(),
  version: z.literal(1).default(1),
  categories: z.array(CategoryJson).default([]),
  skills: z.array(SkillJson).default([]),
  epics: z.array(EpicJson).default([]),
  quests: z.array(QuestJson).default([]),
  schedules: z.array(SchedulePeriodJson).default([]),
  calendarBlocks: z.array(CalendarBlockJson).default([]),
  accounts: z.array(AccountJson).default([]),
  bills: z.array(BillJson).default([]),
  goals: z.array(GoalJson).default([]),
  preferences: PreferencesJson.nullable().optional(),
});
export type ProfileJson = z.infer<typeof ProfileJson>;

const exampleProfile: ProfileJson = {
  exportedAt: "2026-06-04T12:00:00.000Z",
  version: 1,
  categories: [exampleCategory],
  skills: [exampleSkill],
  epics: [exampleEpic],
  quests: [exampleQuest, exampleWeeklyQuest, exampleSideQuest],
  schedules: [exampleSchedule],
  calendarBlocks: [exampleCalendarBlock],
  accounts: [exampleAccount],
  bills: [exampleBill],
  goals: [exampleGoal],
  preferences: examplePreferences,
};

// ---------------------------------------------------------------------------
// Workspace bundle — profile + chapter board in one ordered file
// ---------------------------------------------------------------------------

export const WorkspaceBundleJson = z.object({
  kind: z.literal("workspace_bundle").default("workspace_bundle"),
  exportedAt: z.string().optional(),
  version: z.literal(1).default(1),
  /** The full roadmap (entities). Imported first. */
  profile: ProfileJson,
  /** Optional chapter-board overlay. Imported second so refs resolve. */
  chapterBoard: ChapterBoardJson.nullable().optional(),
});
export type WorkspaceBundleJson = z.infer<typeof WorkspaceBundleJson>;

const exampleWorkspaceBundle: WorkspaceBundleJson = {
  kind: "workspace_bundle",
  exportedAt: "2026-06-21T12:00:00.000Z",
  version: 1,
  profile: exampleProfile,
  chapterBoard: exampleChapterBoard,
};

// ---------------------------------------------------------------------------
// Public registry consumed by JsonHelpDialog.
// ---------------------------------------------------------------------------

export type JsonShape = {
  kind: string;
  title: string;
  summary: string;
  example: unknown;
  notes?: string;
};

export const SHAPES: Record<string, JsonShape> = {
  category: {
    kind: "category",
    title: "Category",
    summary: "A color-coded bucket grouping related Epics (Health, Finance...).",
    example: exampleCategory,
  },
  skill: {
    kind: "skill",
    title: "Skill",
    summary:
      "A capability the user is leveling up. Earns XP from completed milestones and quests linked to it.",
    example: exampleSkill,
  },
  epic: {
    kind: "epic",
    title: "Epic (Long-Term Priority)",
    summary:
      "A top-level life ambition. Contains milestones, optionally linked to a Category and a Target Date.",
    example: exampleEpic,
    notes:
      "On import: `category` and per-milestone `skills` are resolved by name. Missing categories are auto-created with a default color; missing skills are ignored.",
  },
  milestone: {
    kind: "milestone",
    title: "Milestone (sub-goal)",
    summary:
      "A checkpoint inside an Epic. Includes steps to achieve, resources, and skills it grants XP to.",
    example: exampleMilestone,
    notes:
      "Standalone milestone import attaches to a specified Epic by title. Inside a full Epic JSON, milestones are nested.",
  },
  quest: {
    kind: "quest",
    title: "Quest (daily / weekly / one-off)",
    summary:
      "A recurring habit or one-off side quest. cadence='daily'|'weekly'|'one_off'. `skill` (optional) is granted XP on each completion.",
    example: exampleQuest,
    notes:
      "Side quests use cadence='one_off' and typically include a `difficulty` and `expiresAt`.",
  },
  schedule: {
    kind: "schedule",
    title: "Schedule Profile (recurring work window)",
    summary:
      "A recurring weekly work window over an optional date range. days is a 7-char Mon..Sun mask; higher priority wins when ranges overlap. e.g. Summer hours 08:00–15:00, 1 Jul–15 Sep.",
    example: exampleSchedule,
  },
  calendarBlock: {
    kind: "calendarBlock",
    title: "Calendar Block (holiday / time off / focus)",
    summary:
      "A one-off date-ranged event. blocksWork=true suppresses work entirely for that span (holiday/time off); allDay=false uses startTime/endTime.",
    example: exampleCalendarBlock,
  },
  account: {
    kind: "account",
    title: "Financial Account",
    summary:
      "A single asset or liability ledger entry. balanceCents is the integer cent value (€2,485.00 → 248500).",
    example: exampleAccount,
  },
  bill: {
    kind: "bill",
    title: "Recurring Bill",
    summary:
      "Periodic outflow. Cents-based amount, cadence weekly/monthly/yearly, optional nextDueDate.",
    example: exampleBill,
  },
  goal: {
    kind: "goal",
    title: "Financial Goal",
    summary:
      "Savings target. Optionally linked to an Epic by title. currentCents tracks progress vs targetCents.",
    example: exampleGoal,
  },
  preferences: {
    kind: "preferences",
    title: "App Preferences",
    summary:
      "Work window for Steps→time-blocks, Boss Battle lead time, etc. Round-trip only.",
    example: examplePreferences,
  },
  profile: {
    kind: "profile",
    title: "Full Profile Backup",
    summary:
      "Everything: categories, skills, epics (with milestones, steps, resources), quests, accounts, bills, goals, preferences.",
    example: exampleProfile,
    notes:
      "Best paired with the Import flow set to 'Replace' if you want a clean restore — otherwise it merges (new entities added; existing untouched).",
  },
  chapterBoard: {
    kind: "chapterBoard",
    title: "Chapter Board",
    summary:
      "JRPG-style phase planner. Ordered chapters; each chapter holds tiered references to existing Epics, Milestones, or Quests. Doesn't carry the underlying entities — just the ordering overlay.",
    example: exampleChapterBoard,
    notes:
      "On import: each node is resolved by refId first (same-DB round-trip), then by refTitle scoped to the user (portable / LLM-generated). Nodes that resolve to nothing are skipped. Use 'Replace' to wipe the current board before applying; 'Merge' appends imported chapters after existing ones.",
  },
  workspace: {
    kind: "workspace",
    title: "Workspace Bundle (profile + chapter board)",
    summary:
      "One file holding your full Profile AND your Chapter Board. Imported in the right order — entities first, then the board overlay that references them. The frictionless one-shot for moving a complete plan between machines or seeding from an LLM.",
    example: exampleWorkspaceBundle,
    notes:
      "Import applies the profile (mode-aware: upsert/merge/replace) then the board (merge/replace). Because the profile lands first, board node refs resolve against the just-imported epics/milestones/quests — by key, then title.",
  },
};

export type ShapeKey =
  | "category"
  | "skill"
  | "epic"
  | "milestone"
  | "quest"
  | "schedule"
  | "calendarBlock"
  | "account"
  | "bill"
  | "goal"
  | "preferences"
  | "profile"
  | "chapterBoard"
  | "workspace";

/**
 * Per-shape summary used by the import preview step. Each summarizer takes
 * the *validated* parsed payload and returns a list of "row" objects the
 * preview UI renders. The first row's `label` is the headline.
 *
 * Keep these summarizers cheap and pure — they run before any mutation.
 */
export type PreviewRow = {
  label: string;
  /** Optional one-line value rendered to the right of the label. */
  value?: string;
  /** Optional list of sub-items (rendered as a nested unordered list). */
  items?: string[];
};

/**
 * @param opts.maxItems  cap each rendered list at this many items (default 12,
 *                       past which we render a "+N more" trailer). Pass
 *                       `Infinity` to enumerate everything (used by the AI
 *                       pipeline preview + commit screens where the user
 *                       wants to see every single thing about to be added).
 */
export function summarizeImport(
  shape: ShapeKey,
  data: unknown,
  opts: { maxItems?: number } = {},
): PreviewRow[] {
  const itemCap = opts.maxItems ?? 12;
  switch (shape) {
    case "category": {
      const c = data as CategoryJson;
      return [
        { label: "Category", value: c.name },
        { label: "Color", value: c.color },
        ...(c.icon ? [{ label: "Icon", value: c.icon }] : []),
      ];
    }
    case "skill": {
      const s = data as SkillJson;
      return [
        { label: "Skill", value: s.name },
        ...(s.description ? [{ label: "Description", value: s.description }] : []),
      ];
    }
    case "quest": {
      const q = data as QuestJson;
      return [
        { label: "Quest", value: q.title },
        { label: "Cadence", value: q.cadence },
        { label: "XP reward", value: `+${q.xpReward}` },
        ...(q.skill ? [{ label: "Skill", value: q.skill }] : []),
        ...(q.difficulty ? [{ label: "Difficulty", value: q.difficulty }] : []),
      ];
    }
    case "schedule": {
      const s = data as SchedulePeriodJson;
      return [
        { label: "Schedule", value: s.name },
        { label: "Hours", value: `${s.startTime}–${s.endTime}` },
        ...(s.breakStart && s.breakEnd
          ? [{ label: "Break", value: `${s.breakStart}–${s.breakEnd}` }]
          : []),
        ...(s.effectiveFrom || s.effectiveTo
          ? [{ label: "Effective", value: `${s.effectiveFrom ?? "…"} → ${s.effectiveTo ?? "…"}` }]
          : []),
      ];
    }
    case "calendarBlock": {
      const b = data as CalendarBlockJson;
      return [
        { label: "Block", value: b.title },
        { label: "Kind", value: b.kind },
        { label: "Dates", value: `${b.startDate} → ${b.endDate}` },
        ...(b.blocksWork ? [{ label: "Blocks work", value: "yes" }] : []),
      ];
    }
    case "account": {
      const a = data as AccountJson;
      return [
        { label: "Account", value: a.name },
        { label: "Kind", value: a.kind },
        { label: "Category", value: a.category },
        {
          label: "Balance",
          value: `${(a.balanceCents / 100).toFixed(2)} ${a.currency}`,
        },
      ];
    }
    case "bill": {
      const b = data as BillJson;
      return [
        { label: "Bill", value: b.name },
        {
          label: "Amount",
          value: `${(b.amountCents / 100).toFixed(2)} ${b.currency}`,
        },
        { label: "Cadence", value: b.cadence },
        ...(b.nextDueDate ? [{ label: "Next due", value: b.nextDueDate }] : []),
      ];
    }
    case "goal": {
      const g = data as GoalJson;
      return [
        { label: "Goal", value: g.name },
        {
          label: "Target",
          value: `${(g.targetCents / 100).toFixed(2)} ${g.currency}`,
        },
        {
          label: "Current",
          value: `${(g.currentCents / 100).toFixed(2)} ${g.currency}`,
        },
        ...(g.epic ? [{ label: "Epic", value: g.epic }] : []),
        ...(g.targetDate ? [{ label: "Target date", value: g.targetDate }] : []),
      ];
    }
    case "milestone": {
      const m = data as MilestoneJson;
      return [
        { label: "Milestone", value: m.title },
        { label: "Tier", value: String(m.tier) },
        { label: "Status", value: m.status },
        ...(m.estimatedAchievementDate
          ? [{ label: "Estimated date", value: m.estimatedAchievementDate }]
          : []),
        ...(m.steps.length > 0
          ? [
              {
                label: "Steps",
                value: `${m.steps.length}`,
                items: m.steps.slice(0, 6).map((s) => s.title),
              },
            ]
          : []),
        ...(m.resources.length > 0
          ? [
              {
                label: "Resources",
                value: `${m.resources.length}`,
                items: m.resources.slice(0, 6).map((r) => `(${r.kind}) ${r.label}`),
              },
            ]
          : []),
        ...(m.skills.length > 0
          ? [
              {
                label: "Skills",
                value: `${m.skills.length}`,
                items: m.skills,
              },
            ]
          : []),
      ];
    }
    case "epic": {
      const e = data as EpicJson;
      const totalSteps = e.milestones.reduce((s, m) => s + m.steps.length, 0);
      const totalResources = e.milestones.reduce(
        (s, m) => s + m.resources.length,
        0,
      );
      return [
        { label: "Epic", value: e.title },
        { label: "Status", value: e.status },
        ...(e.category ? [{ label: "Category", value: e.category }] : []),
        ...(e.targetDate ? [{ label: "Target date", value: e.targetDate }] : []),
        {
          label: "Milestones",
          value: String(e.milestones.length),
          items: e.milestones.slice(0, 8).map((m) => `T${m.tier} · ${m.title}`),
        },
        ...(totalSteps > 0 ? [{ label: "Steps (total)", value: String(totalSteps) }] : []),
        ...(totalResources > 0
          ? [{ label: "Resources (total)", value: String(totalResources) }]
          : []),
      ];
    }
    case "profile": {
      const p = data as ProfileJson;
      const totalMilestones = p.epics.reduce(
        (sum, e) => sum + e.milestones.length,
        0,
      );
      const totalSteps = p.epics.reduce(
        (sum, e) =>
          sum + e.milestones.reduce((s2, m) => s2 + m.steps.length, 0),
        0,
      );

      // Cap each list at itemCap for legibility — past that we render a
      // "+N more" trailer so the modal doesn't sprawl on huge profiles.
      // Pass `{ maxItems: Infinity }` to enumerate everything.
      const truncate = <T,>(arr: T[], format: (x: T) => string): string[] => {
        if (!Number.isFinite(itemCap)) return arr.map(format);
        const shown = arr.slice(0, itemCap).map(format);
        if (arr.length > itemCap) {
          shown.push(`… and ${arr.length - itemCap} more`);
        }
        return shown;
      };

      const rows: PreviewRow[] = [
        { label: "Roadmap snapshot" },
      ];

      if (p.categories.length > 0) {
        rows.push({
          label: "Categories",
          value: String(p.categories.length),
          items: truncate(p.categories, (c) => `${c.name} · ${c.color}`),
        });
      } else {
        rows.push({ label: "Categories", value: "0" });
      }

      if (p.skills.length > 0) {
        rows.push({
          label: "Skills",
          value: String(p.skills.length),
          items: truncate(p.skills, (s) =>
            s.description ? `${s.name} — ${s.description}` : s.name,
          ),
        });
      } else {
        rows.push({ label: "Skills", value: "0" });
      }

      rows.push({
        label: "Epics",
        value: String(p.epics.length),
        items: truncate(p.epics, (e) => {
          const ms = e.milestones.length;
          const cat = e.category ? ` · ${e.category}` : "";
          return `${e.title}${cat} · ${ms} milestone${ms === 1 ? "" : "s"}`;
        }),
      });

      rows.push({
        label: "Milestones (total)",
        value: String(totalMilestones),
      });
      if (totalSteps > 0) {
        rows.push({ label: "Steps (total)", value: String(totalSteps) });
      }

      if (p.quests.length > 0) {
        rows.push({
          label: "Quests",
          value: String(p.quests.length),
          items: truncate(p.quests, (q) => {
            const skill = q.skill ? ` → ${q.skill}` : "";
            return `${q.title} (${q.cadence}, +${q.xpReward} XP${skill})`;
          }),
        });
      } else {
        rows.push({ label: "Quests", value: "0" });
      }

      if (p.schedules.length > 0) {
        rows.push({
          label: "Schedules",
          value: String(p.schedules.length),
          items: truncate(p.schedules, (s) => {
            const range =
              s.effectiveFrom || s.effectiveTo
                ? ` (${s.effectiveFrom ?? "…"} → ${s.effectiveTo ?? "…"})`
                : "";
            return `${s.name}: ${s.startTime}–${s.endTime}${range}`;
          }),
        });
      }
      if (p.calendarBlocks.length > 0) {
        rows.push({
          label: "Calendar blocks",
          value: String(p.calendarBlocks.length),
          items: truncate(p.calendarBlocks, (b) => {
            const off = b.blocksWork ? " · no work" : "";
            return `${b.title} (${b.kind}) ${b.startDate}→${b.endDate}${off}`;
          }),
        });
      }

      if (p.accounts.length > 0) {
        rows.push({
          label: "Accounts",
          value: String(p.accounts.length),
          items: truncate(p.accounts, (a) => {
            const amount = (a.balanceCents / 100).toFixed(2);
            return `${a.name} (${a.kind}, ${a.category}) — ${amount} ${a.currency}`;
          }),
        });
      } else {
        rows.push({ label: "Accounts", value: "0" });
      }

      if (p.bills.length > 0) {
        rows.push({
          label: "Bills",
          value: String(p.bills.length),
          items: truncate(p.bills, (b) => {
            const amount = (b.amountCents / 100).toFixed(2);
            const due = b.nextDueDate ? ` · next ${b.nextDueDate}` : "";
            return `${b.name} (${b.cadence}) — ${amount} ${b.currency}${due}`;
          }),
        });
      } else {
        rows.push({ label: "Bills", value: "0" });
      }

      if (p.goals.length > 0) {
        rows.push({
          label: "Goals",
          value: String(p.goals.length),
          items: truncate(p.goals, (g) => {
            const target = (g.targetCents / 100).toFixed(2);
            const epic = g.epic ? ` → ${g.epic}` : "";
            return `${g.name} — target ${target} ${g.currency}${epic}`;
          }),
        });
      } else {
        rows.push({ label: "Goals", value: "0" });
      }

      if (p.preferences) {
        rows.push({
          label: "Preferences",
          value: "yes (will be saved)",
          items: [
            `Work window: ${p.preferences.workWindowStart} – ${p.preferences.workWindowEnd}`,
            `Work days mask: ${p.preferences.workWindowDays}`,
            `Default step: ${p.preferences.defaultStepDurationMin} min`,
          ],
        });
      }

      return rows;
    }
    case "preferences": {
      const p = data as PreferencesJson;
      return [
        { label: "Preferences" },
        { label: "Work window", value: `${p.workWindowStart} – ${p.workWindowEnd}` },
        { label: "Work days mask", value: p.workWindowDays },
        { label: "Default step (min)", value: String(p.defaultStepDurationMin) },
      ];
    }
    case "chapterBoard": {
      const b = data as ChapterBoardJson;
      const totalNodes = b.chapters.reduce(
        (sum, c) => sum + c.nodes.length,
        0,
      );
      const epicCount = b.chapters.reduce(
        (s, c) => s + c.nodes.filter((n) => n.kind === "epic").length,
        0,
      );
      const milestoneCount = b.chapters.reduce(
        (s, c) => s + c.nodes.filter((n) => n.kind === "milestone").length,
        0,
      );
      const questCount = b.chapters.reduce(
        (s, c) => s + c.nodes.filter((n) => n.kind === "quest").length,
        0,
      );
      const truncate = <T,>(arr: T[], format: (x: T) => string): string[] => {
        if (!Number.isFinite(itemCap)) return arr.map(format);
        const shown = arr.slice(0, itemCap).map(format);
        if (arr.length > itemCap) {
          shown.push(`… and ${arr.length - itemCap} more`);
        }
        return shown;
      };
      const rows: PreviewRow[] = [
        { label: "Chapter board snapshot" },
        {
          label: "Chapters",
          value: String(b.chapters.length),
          items: truncate(b.chapters, (c) => {
            const cards = c.nodes.length;
            return `${c.title} — ${cards} card${cards === 1 ? "" : "s"}`;
          }),
        },
        { label: "Cards (total)", value: String(totalNodes) },
      ];
      if (epicCount > 0) rows.push({ label: "Epic cards", value: String(epicCount) });
      if (milestoneCount > 0)
        rows.push({ label: "Milestone cards", value: String(milestoneCount) });
      if (questCount > 0) rows.push({ label: "Quest cards", value: String(questCount) });
      return rows;
    }
    case "workspace": {
      const w = data as WorkspaceBundleJson;
      const rows: PreviewRow[] = [{ label: "Workspace bundle" }];
      rows.push(...summarizeImport("profile", w.profile, opts));
      if (w.chapterBoard) {
        rows.push(...summarizeImport("chapterBoard", w.chapterBoard, opts));
      } else {
        rows.push({ label: "Chapter board", value: "none" });
      }
      return rows;
    }
  }
}

/**
 * Build the "Copy as LLM prompt" body — a focused prompt that asks the
 * model to emit valid JSON matching the example shape, with a quick
 * description and the example inlined.
 */
export function buildLlmPrompt(shape: JsonShape, hint?: string): string {
  return `Generate JSON matching the Questline ${shape.title} schema.

Description: ${shape.summary}
${shape.notes ? `Notes: ${shape.notes}\n` : ""}
Return ONLY valid JSON (no commentary, no markdown fences). Use the exact field names below. Match the structure of this example:

\`\`\`json
${JSON.stringify(shape.example, null, 2)}
\`\`\`
${hint ? `\nAdditional context: ${hint}\n` : ""}`;
}
