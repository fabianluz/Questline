CREATE TABLE "calendar_block" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"key" text,
	"title" text NOT NULL,
	"kind" text DEFAULT 'custom' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"all_day" boolean DEFAULT true NOT NULL,
	"start_time" text,
	"end_time" text,
	"blocks_work" boolean DEFAULT false NOT NULL,
	"color" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"key" text,
	"name" text NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"days" text DEFAULT '1111100' NOT NULL,
	"effective_from" date,
	"effective_to" date,
	"color" text,
	"priority" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_block" ADD CONSTRAINT "calendar_block_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_profile" ADD CONSTRAINT "schedule_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_block_user_idx" ON "calendar_block" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "calendar_block_user_range_idx" ON "calendar_block" USING btree ("user_id","start_date","end_date");--> statement-breakpoint
CREATE INDEX "calendar_block_user_key_idx" ON "calendar_block" USING btree ("user_id","key");--> statement-breakpoint
CREATE INDEX "schedule_profile_user_idx" ON "schedule_profile" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "schedule_profile_user_key_idx" ON "schedule_profile" USING btree ("user_id","key");