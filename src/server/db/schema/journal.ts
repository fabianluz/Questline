import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  date,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

/** One block on a day's 00–24 timeline. Stored as JSON inside `day_plan`. */
export type DayPlanBlock = {
  id: string; // client-generated
  start: string; // "HH:MM"
  end: string; // "HH:MM"
  title: string;
  kind:
    | "work"
    | "break"
    | "fixed"
    | "flex"
    | "sleep"
    | "quest"
    | "step"
    | "event"
    | "suggestion";
  source: "template" | "quest" | "step" | "event" | "external" | "ai" | "manual";
  refId?: string | null;
  color?: string | null;
  note?: string | null;
  done?: boolean;
};

/**
 * Reusable recurring time-frames (Work 08–18, Lunch 14–15, Gym…). Keyed by a
 * weekday mask so they auto-populate each matching day's plan. The "Work" block
 * is seeded from the user's work-window preference.
 */
export const dayBlockTemplate = pgTable(
  "day_block_template",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    kind: text("kind").notNull().default("fixed"), // work|break|fixed|flex|sleep
    startHHMM: text("start_hhmm").notNull(),
    endHHMM: text("end_hhmm").notNull(),
    daysMask: text("days_mask").notNull().default("1111111"), // Mon-Sun
    color: text("color"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("day_block_template_user_idx").on(t.userId)],
);

/**
 * The arranged + edited timeline for a single date, plus the generated journal
 * text. One row per (user, date). Blocks are stored as JSON so AI arrangement
 * and user drag-edits round-trip without a per-block table.
 */
export const dayPlan = pgTable(
  "day_plan",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    date: date("date").notNull(), // YYYY-MM-DD
    blocks: jsonb("blocks").$type<DayPlanBlock[]>().notNull().default([]),
    journalText: text("journal_text"),
    model: text("model"), // which local model generated the plan/journal
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("day_plan_user_date_idx").on(t.userId, t.date)],
);
