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
  primaryKey,
  check,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { user } from "./auth";

export const goalStatus = pgEnum("goal_status", [
  "not_started",
  "in_progress",
  "completed",
  "paused",
  "abandoned",
]);

export const category = pgTable(
  "category",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull(),
    icon: text("icon"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("category_user_name_idx").on(t.userId, t.name)],
);

export const epic = pgTable(
  "epic",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => category.id, {
      onDelete: "set null",
    }),
    // Stable import key (slug) for idempotent re-import + cross-references.
    // Nullable; app-enforced unique per user (single-user desktop).
    key: text("key"),
    title: text("title").notNull(),
    description: text("description"),
    status: goalStatus("status").notNull().default("not_started"),
    targetDate: date("target_date"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("epic_user_status_idx").on(t.userId, t.status),
    index("epic_user_key_idx").on(t.userId, t.key),
  ],
);

// Provenance shape stored on milestone.metadata when an AI run produced it.
// Inline `unknown` is fine for the column type — we narrow on read.
export type MilestoneAIProvenance = {
  source: "ai_guide";
  model: string;
  durationMs: number;
  promptTokens: number;
  responseTokens: number;
  generatedAt: string; // ISO 8601
};

// `tier` + `position` drive Parallel Execution: milestones with the same tier
// are tackled simultaneously; `position` orders them within a tier.
export const milestone = pgTable(
  "milestone",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    epicId: uuid("epic_id")
      .notNull()
      .references(() => epic.id, { onDelete: "cascade" }),
    // Stable import key (slug) for idempotent re-import + board references.
    key: text("key"),
    title: text("title").notNull(),
    description: text("description"),
    status: goalStatus("status").notNull().default("not_started"),
    // Planned window: when work is expected to begin and to be achieved.
    estimatedStartDate: date("estimated_start_date"),
    estimatedAchievementDate: date("estimated_achievement_date"),
    // Rough effort estimate in hours — feeds the capacity view (Planning v2).
    estimatedHours: integer("estimated_hours"),
    completedAt: timestamp("completed_at"),
    position: integer("position").notNull().default(0),
    tier: integer("tier").notNull().default(0),
    // Optional provenance / audit data. `MilestoneAIProvenance` is the shape
    // used today, but the column is open for future entries (e.g. manual
    // import sources).
    metadata: jsonb("metadata").$type<MilestoneAIProvenance | Record<string, unknown> | null>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("milestone_epic_idx").on(t.epicId),
    index("milestone_status_idx").on(t.status),
    index("milestone_key_idx").on(t.key),
  ],
);

export const step = pgTable(
  "step",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    milestoneId: uuid("milestone_id")
      .notNull()
      .references(() => milestone.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    position: integer("position").notNull().default(0),
    isCompleted: boolean("is_completed").notNull().default(false),
    // Optional per-step deadline. Editable inline on the epic detail page.
    dueDate: date("due_date"),
    // Rough effort estimate in minutes — feeds the capacity view (Planning v2).
    estimatedMinutes: integer("estimated_minutes"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("step_milestone_idx").on(t.milestoneId)],
);

// `acquired` lets a resource act as a prerequisite (e.g. "buy textbook"
// blocks "practice conversation" until acquired = true).
export const resource = pgTable(
  "resource",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    milestoneId: uuid("milestone_id")
      .notNull()
      .references(() => milestone.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    label: text("label").notNull(),
    url: text("url"),
    notes: text("notes"),
    acquired: boolean("acquired").notNull().default(false),
    acquiredAt: timestamp("acquired_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("resource_milestone_idx").on(t.milestoneId)],
);

export const skill = pgTable(
  "skill",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Stable import key (slug) for idempotent re-import + cross-references.
    key: text("key"),
    name: text("name").notNull(),
    description: text("description"),
    xp: integer("xp").notNull().default(0),
    // Optional "acquire this skill by" deadline — when the user wants to hit
    // a target level / proficiency by a date. Editable on the Skills page.
    targetDate: date("target_date"),
    // Free-text grouping (Tech / Language / Body / Mind / Finance …). Drives
    // the colour of each node in the Skill Constellation view.
    domain: text("domain"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("skill_user_name_idx").on(t.userId, t.name),
    index("skill_user_key_idx").on(t.userId, t.key),
  ],
);

// Skill → skill progression edges for the Constellation view. An edge
// (skillId requires requiredSkillId) means "you should build requiredSkill
// before skill" — e.g. "Spring Boot" requires "Java Basics". The router
// rejects self-edges, duplicates, and any edge that would create a cycle.
export const skillPrerequisite = pgTable(
  "skill_prerequisite",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skill.id, { onDelete: "cascade" }),
    requiredSkillId: uuid("required_skill_id")
      .notNull()
      .references(() => skill.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("skill_prereq_pair_idx").on(t.skillId, t.requiredSkillId),
    index("skill_prereq_skill_idx").on(t.skillId),
    check("skill_prereq_not_self", sql`${t.skillId} <> ${t.requiredSkillId}`),
  ],
);

export const milestoneSkill = pgTable(
  "milestone_skill",
  {
    milestoneId: uuid("milestone_id")
      .notNull()
      .references(() => milestone.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skill.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.milestoneId, t.skillId] })],
);

// A prerequisite locks `milestoneId` until exactly one of:
//   - the referenced milestone is completed
//   - the referenced step is completed
//   - the referenced resource is acquired
// The CHECK constraint enforces that exactly one source is set.
export const prerequisite = pgTable(
  "prerequisite",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    milestoneId: uuid("milestone_id")
      .notNull()
      .references(() => milestone.id, { onDelete: "cascade" }),
    requiredMilestoneId: uuid("required_milestone_id").references(
      () => milestone.id,
      { onDelete: "cascade" },
    ),
    requiredStepId: uuid("required_step_id").references(() => step.id, {
      onDelete: "cascade",
    }),
    requiredResourceId: uuid("required_resource_id").references(
      () => resource.id,
      { onDelete: "cascade" },
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("prerequisite_milestone_idx").on(t.milestoneId),
    check(
      "prerequisite_exactly_one_source",
      sql`(
        (CASE WHEN ${t.requiredMilestoneId} IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN ${t.requiredStepId} IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN ${t.requiredResourceId} IS NOT NULL THEN 1 ELSE 0 END)
      ) = 1`,
    ),
    check(
      "prerequisite_not_self",
      sql`${t.requiredMilestoneId} IS NULL OR ${t.requiredMilestoneId} <> ${t.milestoneId}`,
    ),
  ],
);

// --- Relations ---

export const categoryRelations = relations(category, ({ many }) => ({
  epics: many(epic),
}));

export const epicRelations = relations(epic, ({ one, many }) => ({
  category: one(category, {
    fields: [epic.categoryId],
    references: [category.id],
  }),
  milestones: many(milestone),
}));

export const milestoneRelations = relations(milestone, ({ one, many }) => ({
  epic: one(epic, {
    fields: [milestone.epicId],
    references: [epic.id],
  }),
  steps: many(step),
  resources: many(resource),
  skills: many(milestoneSkill),
  prerequisites: many(prerequisite, { relationName: "blocked" }),
  unlocks: many(prerequisite, { relationName: "required_milestone" }),
}));

export const stepRelations = relations(step, ({ one, many }) => ({
  milestone: one(milestone, {
    fields: [step.milestoneId],
    references: [milestone.id],
  }),
  unlocks: many(prerequisite, { relationName: "required_step" }),
}));

export const resourceRelations = relations(resource, ({ one, many }) => ({
  milestone: one(milestone, {
    fields: [resource.milestoneId],
    references: [milestone.id],
  }),
  unlocks: many(prerequisite, { relationName: "required_resource" }),
}));

export const milestoneSkillRelations = relations(milestoneSkill, ({ one }) => ({
  milestone: one(milestone, {
    fields: [milestoneSkill.milestoneId],
    references: [milestone.id],
  }),
  skill: one(skill, {
    fields: [milestoneSkill.skillId],
    references: [skill.id],
  }),
}));

export const prerequisiteRelations = relations(prerequisite, ({ one }) => ({
  milestone: one(milestone, {
    fields: [prerequisite.milestoneId],
    references: [milestone.id],
    relationName: "blocked",
  }),
  requiredMilestone: one(milestone, {
    fields: [prerequisite.requiredMilestoneId],
    references: [milestone.id],
    relationName: "required_milestone",
  }),
  requiredStep: one(step, {
    fields: [prerequisite.requiredStepId],
    references: [step.id],
    relationName: "required_step",
  }),
  requiredResource: one(resource, {
    fields: [prerequisite.requiredResourceId],
    references: [resource.id],
    relationName: "required_resource",
  }),
}));
