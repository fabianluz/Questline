ALTER TYPE "public"."notification_kind" ADD VALUE 'daily_digest';--> statement-breakpoint
ALTER TABLE "notification_preference" ADD COLUMN "daily_digest" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_preference" ADD COLUMN "digest_time" text DEFAULT '08:00' NOT NULL;