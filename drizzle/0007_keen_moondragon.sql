CREATE TYPE "public"."tcf_level" AS ENUM('A1', 'A2', 'B1', 'B2', 'C1', 'C2');--> statement-breakpoint
CREATE TYPE "public"."tcf_question_type" AS ENUM('image', 'spoken_options', 'dialogue');--> statement-breakpoint
CREATE TYPE "public"."tcf_skill" AS ENUM('listening', 'reading');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tcf_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"set_id" uuid NOT NULL,
	"order_index" integer NOT NULL,
	"level" "tcf_level" NOT NULL,
	"type" "tcf_question_type" NOT NULL,
	"question_text" text NOT NULL,
	"options" jsonb NOT NULL,
	"answer" integer NOT NULL,
	"transcript" text,
	"translation_en" text,
	"explanation" text,
	"image_path" text,
	"audio_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tcf_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"test_number" integer NOT NULL,
	"skill" "tcf_skill" NOT NULL,
	"title" text NOT NULL,
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tcf_questions" ADD CONSTRAINT "tcf_questions_set_id_tcf_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."tcf_sets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tcf_sets_test_skill_idx" ON "tcf_sets" USING btree ("test_number","skill");