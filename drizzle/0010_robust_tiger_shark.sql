-- Speaking (Expression orale) tables only.
-- NOTE: drizzle-kit generated this diff against the 0008 snapshot (0009 was
-- hand-written without one), so the raw output also re-emitted the vocabulary
-- lemma refactor already applied by 0009. Those statements were removed here;
-- the 0010 snapshot correctly reflects the full current schema, so future
-- generates diff cleanly again.
CREATE TYPE "public"."speaking_mode" AS ENUM('script_practice', 'simulation');--> statement-breakpoint
CREATE TYPE "public"."speaking_role" AS ENUM('examiner', 'user');--> statement-breakpoint
CREATE TYPE "public"."speaking_session_status" AS ENUM('active', 'completed', 'abandoned');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "speaking_prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task" integer NOT NULL,
	"prompt" text NOT NULL,
	"context" text,
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "speaking_scripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prompt_id" uuid NOT NULL,
	"content" text NOT NULL,
	"profile_snapshot" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "speaking_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prompt_id" uuid NOT NULL,
	"mode" "speaking_mode" NOT NULL,
	"status" "speaking_session_status" DEFAULT 'active' NOT NULL,
	"report" jsonb,
	"scores" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "speaking_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"order_index" integer NOT NULL,
	"role" "speaking_role" NOT NULL,
	"text" text NOT NULL,
	"audio_path" text,
	"assessment" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "speaking_scripts" ADD CONSTRAINT "speaking_scripts_prompt_id_speaking_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."speaking_prompts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "speaking_sessions" ADD CONSTRAINT "speaking_sessions_prompt_id_speaking_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."speaking_prompts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "speaking_turns" ADD CONSTRAINT "speaking_turns_session_id_speaking_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."speaking_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "speaking_prompts_task_prompt_idx" ON "speaking_prompts" USING btree ("task","prompt");
