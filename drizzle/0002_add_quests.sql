CREATE TYPE "public"."quest_cadence" AS ENUM('daily', 'weekly');--> statement-breakpoint
CREATE TABLE "quest" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"cadence" "quest_cadence" DEFAULT 'daily' NOT NULL,
	"xp_reward" integer DEFAULT 10 NOT NULL,
	"skill_id" uuid,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quest_completion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quest_id" uuid NOT NULL,
	"completed_for" date NOT NULL,
	"completed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quest" ADD CONSTRAINT "quest_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest" ADD CONSTRAINT "quest_skill_id_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skill"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_completion" ADD CONSTRAINT "quest_completion_quest_id_quest_id_fk" FOREIGN KEY ("quest_id") REFERENCES "public"."quest"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quest_user_active_idx" ON "quest" USING btree ("user_id","archived");--> statement-breakpoint
CREATE UNIQUE INDEX "quest_completion_unique_idx" ON "quest_completion" USING btree ("quest_id","completed_for");--> statement-breakpoint
CREATE INDEX "quest_completion_quest_idx" ON "quest_completion" USING btree ("quest_id");