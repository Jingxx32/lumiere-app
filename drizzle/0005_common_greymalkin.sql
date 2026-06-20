CREATE TYPE "public"."quiz_section" AS ENUM('reading', 'listening', 'grammar', 'vocabulary', 'dictation', 'conjugation');--> statement-breakpoint
CREATE TYPE "public"."quiz_type" AS ENUM('single', 'multi', 'true_false', 'fill_blank');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quiz_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"set_id" text NOT NULL,
	"score" integer NOT NULL,
	"total" integer NOT NULL,
	"answered_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quiz_passages" (
	"id" text PRIMARY KEY NOT NULL,
	"set_id" text NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"text" text NOT NULL,
	"audio_url" text,
	"source_type" text,
	"source_url" text,
	"media_duration" integer,
	"segment_start" integer,
	"segment_end" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quiz_questions" (
	"id" text PRIMARY KEY NOT NULL,
	"passage_id" text NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"type" "quiz_type" NOT NULL,
	"question_text" text NOT NULL,
	"options" jsonb,
	"answer" jsonb NOT NULL,
	"explanation" text,
	"audio_start" integer,
	"audio_end" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quiz_sets" (
	"id" text PRIMARY KEY NOT NULL,
	"exam" text NOT NULL,
	"number" integer,
	"section" "quiz_section" NOT NULL,
	"title" text NOT NULL,
	"source" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_set_id_quiz_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."quiz_sets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quiz_passages" ADD CONSTRAINT "quiz_passages_set_id_quiz_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."quiz_sets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_passage_id_quiz_passages_id_fk" FOREIGN KEY ("passage_id") REFERENCES "public"."quiz_passages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
