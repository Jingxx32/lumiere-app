CREATE TABLE IF NOT EXISTS "tcf_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"set_id" uuid,
	"skill" "tcf_skill" NOT NULL,
	"test_number" integer NOT NULL,
	"score" integer NOT NULL,
	"total" integer NOT NULL,
	"per_level" jsonb,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tcf_attempts" ADD CONSTRAINT "tcf_attempts_set_id_tcf_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."tcf_sets"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tcf_attempts_set_id_idx" ON "tcf_attempts" USING btree ("set_id");