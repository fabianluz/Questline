ALTER TABLE "epic" ADD COLUMN "key" text;--> statement-breakpoint
ALTER TABLE "milestone" ADD COLUMN "key" text;--> statement-breakpoint
ALTER TABLE "skill" ADD COLUMN "key" text;--> statement-breakpoint
ALTER TABLE "quest" ADD COLUMN "key" text;--> statement-breakpoint
CREATE INDEX "epic_user_key_idx" ON "epic" USING btree ("user_id","key");--> statement-breakpoint
CREATE INDEX "milestone_key_idx" ON "milestone" USING btree ("key");--> statement-breakpoint
CREATE INDEX "skill_user_key_idx" ON "skill" USING btree ("user_id","key");--> statement-breakpoint
CREATE INDEX "quest_user_key_idx" ON "quest" USING btree ("user_id","key");