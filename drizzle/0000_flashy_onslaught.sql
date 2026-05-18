CREATE TYPE "public"."document_type" AS ENUM('news', 'literature', 'personal', 'other');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documents" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"source" text,
	"source_url" text,
	"type" "document_type" DEFAULT 'other' NOT NULL,
	"content" text NOT NULL,
	"language" text DEFAULT 'fr' NOT NULL,
	"estimated_level" text,
	"word_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_read_at" timestamp,
	"reading_progress" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "errors" (
	"id" text PRIMARY KEY NOT NULL,
	"submission_id" text NOT NULL,
	"span_start" integer NOT NULL,
	"span_end" integer NOT NULL,
	"original" text NOT NULL,
	"correction" text NOT NULL,
	"category" text NOT NULL,
	"subcategory" text NOT NULL,
	"trigger_context" text,
	"explanation_en" text NOT NULL,
	"fr_examples" jsonb,
	"rule_id" text,
	"micro_drill" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reading_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	"duration_seconds" integer DEFAULT 0 NOT NULL,
	"vocabulary_looked_up" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rules" (
	"id" text PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"subcategory" text NOT NULL,
	"name" text NOT NULL,
	"description_en" text NOT NULL,
	"examples" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"content_fr" text NOT NULL,
	"word_count" integer DEFAULT 0 NOT NULL,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"feedback_json" jsonb,
	"estimated_level" text,
	"praise" jsonb,
	"summary_en" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "writing_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text,
	"prompt_en" text NOT NULL,
	"target_words" jsonb NOT NULL,
	"target_grammar" jsonb NOT NULL,
	"difficulty" text,
	"min_word_count" integer DEFAULT 50 NOT NULL,
	"max_word_count" integer DEFAULT 200 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "errors" ADD CONSTRAINT "errors_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reading_sessions" ADD CONSTRAINT "reading_sessions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "submissions" ADD CONSTRAINT "submissions_task_id_writing_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."writing_tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "writing_tasks" ADD CONSTRAINT "writing_tasks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
