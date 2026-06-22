import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * Per-user secret token that grants read-only access to that user's iCalendar
 * feed at `/api/calendar/<token>/feed.ics`. Standalone calendar clients
 * (Apple Calendar, Google Calendar, Outlook) can subscribe to this URL and
 * re-fetch on their own schedule.
 *
 * One row per user — `userId` is unique. Token can be rotated via the
 * `calendar.regenerateToken` mutation, which invalidates any clients still
 * subscribed to the previous URL.
 */
export const calendarFeed = pgTable("calendar_feed", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  rotatedAt: timestamp("rotated_at"),
});
