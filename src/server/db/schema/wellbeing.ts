import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  boolean,
  date,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

// ---------------------------------------------------------------------------
// §10 — Save Points (weekly retrospective)
// ---------------------------------------------------------------------------

/**
 * One row per weekly retro. `weekStart` is the Monday (UTC). The user fills
 * in `wentWell` / `struggled` / `nextWeekFocus`; the AI Guide reads the past
 * week's completions and generates a draft if the user clicks "Generate".
 */
export const weeklyRetrospective = pgTable(
  "weekly_retrospective",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    weekStart: date("week_start").notNull(), // Monday UTC
    wentWell: text("went_well"),
    struggled: text("struggled"),
    nextWeekFocus: text("next_week_focus"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("retro_user_week_idx").on(t.userId, t.weekStart)],
);

// ---------------------------------------------------------------------------
// §5 + §10 — User preferences (work window + onboarding state)
// ---------------------------------------------------------------------------

/**
 * Single-row preference store per user. Covers:
 *   §5  — work-window for Steps→time-blocks calendar emission
 *   §10 — onboarding tutorial state machine
 *
 * Earlier iterations also tracked theme (now JRPG always), fatigue
 * acknowledgement (Fatigue meter removed), and Boss Battle lead days
 * (Boss Battle removed). Columns may still exist in production DBs but
 * are no longer read or written.
 */
export const userPreference = pgTable("user_preference", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  // §5 — UTC "HH:MM" bounds + weekday mask. We schedule Steps inside this.
  workWindowStart: text("work_window_start").notNull().default("09:00"),
  workWindowEnd: text("work_window_end").notNull().default("17:00"),
  // 7-char mask, "1" = scheduled, "0" = off. index 0 = Monday … 6 = Sunday.
  workWindowDays: text("work_window_days").notNull().default("1111100"),
  defaultStepDurationMin: integer("default_step_duration_min")
    .notNull()
    .default(45),
  // §10 — onboarding state machine
  //   ("avatar" | "first_quest" | "first_epic" | "done"). Stored as plain
  //   text rather than an enum so we can rename future steps without a
  //   PostgreSQL TYPE migration each time.
  onboardingStep: text("onboarding_step").notNull().default("avatar"),
  // Selected local Ollama model for every AI action (epic break-down, chapter
  // planner, Ask the Guide, notes→JSON, …). Null → fall back to the server
  // default (env OLLAMA_MODEL, else qwen2.5:14b). Switchable in Model Manager.
  aiModel: text("ai_model"),
  // Per-surface model overrides: { [ModelSurface]: ollamaRef }. A surface absent
  // here falls through to Auto routing (if enabled) then the global aiModel.
  surfaceModels: jsonb("surface_models").$type<Record<string, string>>(),
  // When true, surfaces without an explicit override are auto-routed to the
  // best installed model for that task (see lib/model-routing autoPickForSurface).
  autoRouteModels: boolean("auto_route_models").notNull().default(false),
  // Free-text "house style" appended to every AI surface's persona (tone,
  // language, length). Null → just the default per-surface persona.
  houseStyle: text("house_style"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// §5 — External calendar ingestion (two-way calendar)
// ---------------------------------------------------------------------------

/**
 * Events parsed from an .ics file the user uploaded. Stored read-only and
 * shown on the global roadmap alongside Questline-native milestones, so the
 * user can see external commitments without leaving the app.
 */
export const externalCalendarSource = pgTable(
  "external_calendar_source",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    label: text("label").notNull(), // user-supplied ("Work calendar")
    color: text("color").notNull().default("#6366f1"),
    lastImportedAt: timestamp("last_imported_at").notNull().defaultNow(),
    eventCount: integer("event_count").notNull().default(0),
  },
  (t) => [index("external_source_user_idx").on(t.userId)],
);

export const externalEvent = pgTable(
  "external_event",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => externalCalendarSource.id, { onDelete: "cascade" }),
    uid: text("uid").notNull(), // VEVENT UID for dedupe on re-import
    summary: text("summary").notNull(),
    startsAt: timestamp("starts_at").notNull(),
    endsAt: timestamp("ends_at"),
    allDay: boolean("all_day").notNull().default(false),
  },
  (t) => [
    uniqueIndex("external_event_source_uid_idx").on(t.sourceId, t.uid),
    index("external_event_starts_idx").on(t.startsAt),
  ],
);
