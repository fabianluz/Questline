ALTER TYPE "public"."notification_kind" ADD VALUE 'milestone_starting' BEFORE 'bill_upcoming';--> statement-breakpoint
ALTER TABLE "milestone" ADD COLUMN "estimated_start_date" date;