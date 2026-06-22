import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  boolean,
  date,
  index,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

// ---------------------------------------------------------------------------
// Time-block scheduling (Planning v2, Phase 2)
//
// Promotes the single `userPreference.workWindow*` setting into first-class,
// date-ranged data so the app can know e.g. "Summer hours 08:00–15:00 from
// 1 Jul–15 Sep" and "no work during a holiday block". The pure resolver in
// src/lib/schedule.ts answers "what's my work window on date D" by checking
// calendar blocks → schedule profiles → the legacy workWindow fallback.
// ---------------------------------------------------------------------------

/** A recurring weekly work window that applies over an (optional) date range. */
export const scheduleProfile = pgTable(
  "schedule_profile",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Stable import key (slug) for idempotent re-import.
    key: text("key"),
    name: text("name").notNull(),
    startTime: text("start_time").notNull(), // "HH:MM"
    endTime: text("end_time").notNull(), // "HH:MM"
    // Optional mid-day break (e.g. lunch 14:00–15:00). Carved out of the work
    // window so the day planner + capacity skip it. Both null = no break.
    breakStart: text("break_start"), // "HH:MM"
    breakEnd: text("break_end"), // "HH:MM"
    days: text("days").notNull().default("1111100"), // 7-char mask, idx0 = Monday
    // Effective window (inclusive). NULL = open-ended on that side.
    effectiveFrom: date("effective_from"),
    effectiveTo: date("effective_to"),
    color: text("color"),
    // Higher priority wins when two profiles cover the same date.
    priority: integer("priority").notNull().default(0),
    active: boolean("active").notNull().default(true),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("schedule_profile_user_idx").on(t.userId),
    index("schedule_profile_user_key_idx").on(t.userId, t.key),
  ],
);

/** A one-off, date-ranged event (holiday, trip, focus block) that can suppress
 *  or override the recurring schedule. `blocksWork` = "no work this span". */
export const calendarBlock = pgTable(
  "calendar_block",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    key: text("key"),
    title: text("title").notNull(),
    // holiday | time_off | travel | focus | busy | custom (validated in Zod).
    kind: text("kind").notNull().default("custom"),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    allDay: boolean("all_day").notNull().default(true),
    startTime: text("start_time"), // "HH:MM" when not all-day
    endTime: text("end_time"),
    blocksWork: boolean("blocks_work").notNull().default(false),
    color: text("color"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("calendar_block_user_idx").on(t.userId),
    index("calendar_block_user_range_idx").on(t.userId, t.startDate, t.endDate),
    index("calendar_block_user_key_idx").on(t.userId, t.key),
  ],
);
