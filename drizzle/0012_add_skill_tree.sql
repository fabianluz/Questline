CREATE TABLE "skill_prerequisite" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"skill_id" uuid NOT NULL,
	"required_skill_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "skill_prereq_not_self" CHECK ("skill_prerequisite"."skill_id" <> "skill_prerequisite"."required_skill_id")
);
--> statement-breakpoint
ALTER TABLE "skill" ADD COLUMN "domain" text;--> statement-breakpoint
ALTER TABLE "skill_prerequisite" ADD CONSTRAINT "skill_prerequisite_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_prerequisite" ADD CONSTRAINT "skill_prerequisite_skill_id_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skill"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_prerequisite" ADD CONSTRAINT "skill_prerequisite_required_skill_id_skill_id_fk" FOREIGN KEY ("required_skill_id") REFERENCES "public"."skill"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "skill_prereq_pair_idx" ON "skill_prerequisite" USING btree ("skill_id","required_skill_id");--> statement-breakpoint
CREATE INDEX "skill_prereq_skill_idx" ON "skill_prerequisite" USING btree ("skill_id");