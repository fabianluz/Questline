import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  boolean,
  date,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { user } from "./auth";
import { epic } from "./goals";

// All money stored as integer cents — no float drift, easy to sum in SQL.
// Currency code is freeform ISO-4217 (e.g. "EUR", "USD"); first cut treats it
// as a label, no FX conversion yet.

export const financialKind = pgEnum("financial_kind", ["asset", "liability"]);
export const billCadence = pgEnum("bill_cadence", [
  "weekly",
  "monthly",
  "yearly",
]);
export const financialGoalStatus = pgEnum("financial_goal_status", [
  "active",
  "achieved",
  "abandoned",
]);

/**
 * A single "ledger entry" for the user's wealth — bank account, credit card,
 * cash, crypto position, etc. `kind` splits the list into assets/liabilities.
 * `category` is a free-text bucket ("checking", "savings", "credit_card",
 * "mortgage", "investment") so the user can group without us prescribing.
 */
export const financialAccount = pgTable(
  "financial_account",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: financialKind("kind").notNull(),
    category: text("category").notNull().default("other"),
    balanceCents: integer("balance_cents").notNull().default(0),
    currency: text("currency").notNull().default("EUR"),
    notes: text("notes"),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("financial_account_user_active_idx").on(t.userId, t.archived),
    index("financial_account_kind_idx").on(t.userId, t.kind),
  ],
);

/**
 * Recurring outflows — rent, subscriptions, utilities, etc. We don't model
 * a transactions ledger yet; this is just "what do I pay every N days."
 * `nextDueDate` is informational and updated manually for now.
 */
export const recurringBill = pgTable(
  "recurring_bill",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("EUR"),
    cadence: billCadence("cadence").notNull().default("monthly"),
    category: text("category").notNull().default("other"),
    nextDueDate: date("next_due_date"),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("recurring_bill_user_active_idx").on(t.userId, t.archived)],
);

/**
 * Savings targets — e.g. "Save €1,000 for Netherlands move." Optional FK to
 * an epic so the goal can be visually tied to a Long-Term Priority.
 * `currentCents` is updated manually for now (the user enters their current
 * saved amount); future polish can auto-aggregate from a tagged account.
 */
export const financialGoal = pgTable(
  "financial_goal",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    targetCents: integer("target_cents").notNull(),
    currentCents: integer("current_cents").notNull().default(0),
    currency: text("currency").notNull().default("EUR"),
    targetDate: date("target_date"),
    epicId: uuid("epic_id").references(() => epic.id, {
      onDelete: "set null",
    }),
    status: financialGoalStatus("status").notNull().default("active"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("financial_goal_user_status_idx").on(t.userId, t.status)],
);

// --- Relations ---

export const financialGoalRelations = relations(financialGoal, ({ one }) => ({
  epic: one(epic, {
    fields: [financialGoal.epicId],
    references: [epic.id],
  }),
}));
