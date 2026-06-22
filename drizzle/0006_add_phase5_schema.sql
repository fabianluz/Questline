CREATE TYPE "public"."quest_difficulty" AS ENUM('trivial', 'normal', 'hard');--> statement-breakpoint
CREATE TYPE "public"."debuff_kind" AS ENUM('poisoned', 'encumbered', 'frozen', 'weakened');--> statement-breakpoint
CREATE TYPE "public"."health_event_kind" AS ENUM('workout', 'steps', 'active_calories', 'mindful_minutes', 'sleep_hours', 'stand_hours');--> statement-breakpoint
ALTER TYPE "public"."quest_cadence" ADD VALUE 'one_off';--> statement-breakpoint
CREATE TABLE "debuff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" "debuff_kind" NOT NULL,
	"note" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"cleared_at" timestamp,
	"requirement_scale_pct" integer DEFAULT 50 NOT NULL,
	"deadline_shift_days" integer DEFAULT 7 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_calendar_source" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"label" text NOT NULL,
	"color" text DEFAULT '#6366f1' NOT NULL,
	"last_imported_at" timestamp DEFAULT now() NOT NULL,
	"event_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"uid" text NOT NULL,
	"summary" text NOT NULL,
	"starts_at" timestamp NOT NULL,
	"ends_at" timestamp,
	"all_day" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"external_id" text NOT NULL,
	"kind" "health_event_kind" NOT NULL,
	"value" integer NOT NULL,
	"unit" text NOT NULL,
	"occurred_at" timestamp NOT NULL,
	"awarded_skill_id" uuid,
	"awarded_xp" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_preference" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"theme" text DEFAULT 'classic' NOT NULL,
	"work_window_start" text DEFAULT '09:00' NOT NULL,
	"work_window_end" text DEFAULT '17:00' NOT NULL,
	"work_window_days" text DEFAULT '1111100' NOT NULL,
	"default_step_duration_min" integer DEFAULT 45 NOT NULL,
	"fatigue_ack_at" timestamp,
	"boss_battle_lead_days" integer DEFAULT 7 NOT NULL,
	"onboarding_step" text DEFAULT 'avatar' NOT NULL,
	"last_save_point_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_preference_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "weekly_retrospective" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"week_start" date NOT NULL,
	"went_well" text,
	"struggled" text,
	"next_week_focus" text,
	"stats" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quest" ADD COLUMN "difficulty" "quest_difficulty";--> statement-breakpoint
ALTER TABLE "quest" ADD COLUMN "expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "quest" ADD COLUMN "ai_suggested" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "debuff" ADD CONSTRAINT "debuff_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_calendar_source" ADD CONSTRAINT "external_calendar_source_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_event" ADD CONSTRAINT "external_event_source_id_external_calendar_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."external_calendar_source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_event" ADD CONSTRAINT "health_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preference" ADD CONSTRAINT "user_preference_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_retrospective" ADD CONSTRAINT "weekly_retrospective_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "debuff_user_active_idx" ON "debuff" USING btree ("user_id","cleared_at");--> statement-breakpoint
CREATE INDEX "external_source_user_idx" ON "external_calendar_source" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "external_event_source_uid_idx" ON "external_event" USING btree ("source_id","uid");--> statement-breakpoint
CREATE INDEX "external_event_starts_idx" ON "external_event" USING btree ("starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "health_event_user_extid_idx" ON "health_event" USING btree ("user_id","external_id");--> statement-breakpoint
CREATE INDEX "health_event_user_kind_idx" ON "health_event" USING btree ("user_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "retro_user_week_idx" ON "weekly_retrospective" USING btree ("user_id","week_start");