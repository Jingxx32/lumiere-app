CREATE TABLE IF NOT EXISTS "micro_drills" (
	"id" text PRIMARY KEY NOT NULL,
	"error_id" text NOT NULL,
	"prompt_text" text NOT NULL,
	"response_fr" text NOT NULL,
	"feedback_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "micro_drills" ADD CONSTRAINT "micro_drills_error_id_errors_id_fk" FOREIGN KEY ("error_id") REFERENCES "public"."errors"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
