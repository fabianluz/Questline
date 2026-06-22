import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  boolean,
  date,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { user } from "./auth";
import { skill } from "./goals";

export const questCadence = pgEnum("quest_cadence", [
  "daily",
  "weekly",
  "one_off", // §7 — Side Quests / Notice Board
]);

// §7 Side-quest difficulty — drives XP reward and visual chip color.
export const questDifficulty = pgEnum("quest_difficulty", [
  "trivial",
  "normal",
  "hard",
]);

// A recurring habit — daily or weekly. "Daily Quests" in brief §5.
// Completing one in its period grants xpReward to the linked skill (if any)
// and contributes to the user's current streak.
export const quest = pgTable(
  "quest",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Stable import key (slug) for idempotent re-import + board references.
    key: text("key"),
    title: text("title").notNull(),
    description: text("description"),
    cadence: questCadence("cadence").notNull().default("daily"),
    xpReward: integer("xp_reward").notNull().default(10),
    skillId: uuid("skill_id").references(() => skill.id, {
      onDelete: "set null",
    }),
    // §7 — one-off side quests have a difficulty (drives XP + chip color)
    // and an optional expiresAt (Notice Board can prune stale items).
    // Daily/weekly quests leave these null.
    difficulty: questDifficulty("difficulty"),
    expiresAt: timestamp("expires_at"),
    // Planning v2: a recurring quest can be active only within a date window
    // (e.g. "Java 1h" starts 13 Jul) and aim for N completions per period
    // (e.g. gym 4×/week). Null = no bound / single-tick.
    startDate: date("start_date"),
    endDate: date("end_date"),
    timesPerPeriod: integer("times_per_period"),
    // §7 — AI-suggested side quests flagged here so the UI can badge them.
    aiSuggested: boolean("ai_suggested").notNull().default(false),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("quest_user_active_idx").on(t.userId, t.archived),
    index("quest_user_key_idx").on(t.userId, t.key),
  ],
);

// One row per completion. For daily quests, completedFor is the day;
// for weekly quests, it's the Monday of that week. The unique constraint
// prevents double-counting a single period.
export const questCompletion = pgTable(
  "quest_completion",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    questId: uuid("quest_id")
      .notNull()
      .references(() => quest.id, { onDelete: "cascade" }),
    completedFor: date("completed_for").notNull(),
    completedAt: timestamp("completed_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("quest_completion_unique_idx").on(t.questId, t.completedFor),
    index("quest_completion_quest_idx").on(t.questId),
  ],
);

export const questRelations = relations(quest, ({ one, many }) => ({
  skill: one(skill, {
    fields: [quest.skillId],
    references: [skill.id],
  }),
  completions: many(questCompletion),
}));

export const questCompletionRelations = relations(
  questCompletion,
  ({ one }) => ({
    quest: one(quest, {
      fields: [questCompletion.questId],
      references: [quest.id],
    }),
  }),
);
