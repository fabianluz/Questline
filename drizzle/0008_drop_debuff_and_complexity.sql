DROP TABLE "debuff" CASCADE;--> statement-breakpoint
ALTER TABLE "user_preference" DROP COLUMN "theme";--> statement-breakpoint
ALTER TABLE "user_preference" DROP COLUMN "fatigue_ack_at";--> statement-breakpoint
ALTER TABLE "user_preference" DROP COLUMN "boss_battle_lead_days";--> statement-breakpoint
DROP TYPE "public"."debuff_kind";