import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * JRPG-style chapter board.
 *
 *   chapter      — a phase of the user's plan. Ordered left-to-right.
 *   board_node   — a card placed inside a chapter. References an existing
 *                  Epic / Milestone / Quest by id. Cards have a `tier`
 *                  (same tier = parallel work, mirroring the Skill Tree
 *                  semantics) and a `position` for ordering inside the
 *                  tier.
 *
 * The board is a SCHEDULING OVERLAY on the existing data — it doesn't
 * replace tier/position on Milestones. A Milestone can be on the board
 * with `tier=0, position=2` while its in-Epic tier is something different.
 * The two ordering systems are independent on purpose: the Skill Tree
 * captures "what depends on what within an Epic"; the chapter board
 * captures "what life-phase am I tackling this in, alongside what."
 */

export const boardNodeKind = pgEnum("board_node_kind", [
  "epic",
  "milestone",
  "quest",
]);

export const chapter = pgTable(
  "chapter",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** Left-to-right ordering. Higher = later. */
    position: integer("position").notNull().default(0),
    /** Optional hex color for the chapter banner. */
    color: text("color"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("chapter_user_idx").on(t.userId, t.position),
  ],
);

export const boardNode = pgTable(
  "board_node",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    chapterId: uuid("chapter_id")
      .notNull()
      .references(() => chapter.id, { onDelete: "cascade" }),
    /** Which entity table this card points at. */
    kind: boardNodeKind("kind").notNull(),
    /** ID of the referenced entity. Not a foreign key (polymorphic) —
     * dangling references are tolerated (the UI shows a "deleted" chip).
     * Cleanup happens at list-time. */
    refId: uuid("ref_id").notNull(),
    /** Within a chapter, same tier = parallel work. */
    tier: integer("tier").notNull().default(0),
    /** Ordering within a tier. */
    position: integer("position").notNull().default(0),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("board_node_chapter_idx").on(t.chapterId, t.tier, t.position),
    index("board_node_user_idx").on(t.userId),
  ],
);
