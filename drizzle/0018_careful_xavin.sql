ALTER TABLE "user_preference" ADD COLUMN "surface_models" jsonb;--> statement-breakpoint
ALTER TABLE "user_preference" ADD COLUMN "auto_route_models" boolean DEFAULT false NOT NULL;