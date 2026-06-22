ALTER TABLE "notification_preference" ADD COLUMN "quiet_hours_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_preference" ADD COLUMN "quiet_start" text DEFAULT '22:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_preference" ADD COLUMN "quiet_end" text DEFAULT '07:00' NOT NULL;