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
import { user } from "./auth";

/**
 * Browser-notification preferences. One row per user (created lazily on first
 * read). The feature is *off* by default — we don't want to ask for OS-level
 * permission until the user explicitly opts in via the settings card.
 *
 * `questReminderTime` is "HH:MM" 24h UTC. We don't model timezones server-side;
 * the client converts the wall clock it sees into UTC before saving and back
 * the other way on render. (Single-user app on a single laptop — fine.)
 */
export const notificationKind = pgEnum("notification_kind", [
  "quest_due",
  "milestone_upcoming",
  "milestone_starting",
  "bill_upcoming",
  "daily_digest",
]);

export const notificationPreference = pgTable("notification_preference", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  // "HH:MM" wall-clock — when daily quests still pending should remind.
  questReminderTime: text("quest_reminder_time").notNull().default("18:00"),
  // Notify when a milestone with an estimated date is within N days.
  milestoneReminderDays: integer("milestone_reminder_days").notNull().default(7),
  // Notify when a bill's next-due-date is within N days.
  billReminderDays: integer("bill_reminder_days").notNull().default(3),
  // When on, replace the individual reminders with ONE daily summary fired at
  // `digestTime` ("HH:MM" wall-clock). Off → per-item notifications (legacy).
  dailyDigest: boolean("daily_digest").notNull().default(false),
  digestTime: text("digest_time").notNull().default("08:00"),
  // Quiet hours: while on, NO notifications fire between `quietStart` and
  // `quietEnd` ("HH:MM", may wrap past midnight). Same UTC wall-clock
  // convention as the reminder times above.
  quietHoursEnabled: boolean("quiet_hours_enabled").notNull().default(false),
  quietStart: text("quiet_start").notNull().default("22:00"),
  quietEnd: text("quiet_end").notNull().default("07:00"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Dedupe ledger. The server returns a notification as "pending" only if no
 * matching row exists in this table for today (UTC). The client calls
 * `markFired` after `new Notification(...)` succeeds, which writes the row
 * and prevents re-firing on the next poll.
 *
 * `refId` is the originating entity (quest.id / milestone.id / bill.id) so the
 * uniqueness key (userId, kind, refId, firedFor) gives us natural dedupe.
 */
export const notificationLog = pgTable(
  "notification_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: notificationKind("kind").notNull(),
    refId: uuid("ref_id").notNull(),
    firedFor: date("fired_for").notNull(),
    firedAt: timestamp("fired_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("notification_log_unique_idx").on(
      t.userId,
      t.kind,
      t.refId,
      t.firedFor,
    ),
    index("notification_log_user_idx").on(t.userId, t.firedFor),
  ],
);
