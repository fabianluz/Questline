ALTER TABLE "milestone" ADD COLUMN "estimated_hours" integer;--> statement-breakpoint
ALTER TABLE "step" ADD COLUMN "estimated_minutes" integer;--> statement-breakpoint
ALTER TABLE "quest" ADD COLUMN "start_date" date;--> statement-breakpoint
ALTER TABLE "quest" ADD COLUMN "end_date" date;--> statement-breakpoint
ALTER TABLE "quest" ADD COLUMN "times_per_period" integer;