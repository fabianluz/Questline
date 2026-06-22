import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { skill } from "./goals";

/**
 * Focus Sessions — the "do the work" loop. The user starts a timer against a
 * step / milestone / quest (or freeform), and on stop we record the elapsed
 * minutes and award XP to an optional linked skill. Feeds the Chronicle stats
 * screen (time-by-category) and the Daily Journal (actual time spent).
 *
 * A session with `endedAt = null` is currently running. At most one per user
 * should be running at a time (the start mutation stops any existing one).
 */
export const focusSession = pgTable(
  "focus_session",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // What the session is about (snapshot label so it survives ref deletion).
    label: text("label").notNull(),
    // Loose reference to the originating entity, for analytics/back-links.
    refType: text("ref_type").notNull().default("none"), // milestone|step|quest|none
    refId: uuid("ref_id"),
    // Optional skill that earns XP from this session's minutes.
    skillId: uuid("skill_id").references(() => skill.id, {
      onDelete: "set null",
    }),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    endedAt: timestamp("ended_at"), // null = running
    durationMin: integer("duration_min").notNull().default(0),
    xpAwarded: integer("xp_awarded").notNull().default(0),
    note: text("note"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("focus_session_user_idx").on(t.userId, t.startedAt),
    index("focus_session_skill_idx").on(t.skillId),
  ],
);
