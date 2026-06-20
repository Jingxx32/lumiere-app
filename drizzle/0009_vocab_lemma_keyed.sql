-- Drop existing vocabulary_lookups (word-keyed) table — legacy rows not migrated (spec §6)
DROP TABLE IF EXISTS "vocabulary_lookups" CASCADE;--> statement-breakpoint

-- Create vocab_source enum
CREATE TYPE "public"."vocab_source" AS ENUM('reading', 'tcf');--> statement-breakpoint

-- Create new lemma-keyed vocabulary_lookups table
CREATE TABLE "vocabulary_lookups" (
	"id" text PRIMARY KEY NOT NULL,
	"lemma" text NOT NULL,
	"surface" text NOT NULL,
	"pos" text,
	"translation" text,
	"cefr_level" text,
	"in_context" text,
	"examples" jsonb,
	"conjugation" text,
	"sentence_context" text,
	"rich_entry" jsonb,
	"enriched_at" timestamp,
	"looked_up_at" timestamp DEFAULT now() NOT NULL,
	"saved_at" timestamp,
	"review_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "vocabulary_lookups_lemma_unique" UNIQUE("lemma")
);--> statement-breakpoint

-- Create vocabulary_aliases table
CREATE TABLE "vocabulary_aliases" (
	"surface" text PRIMARY KEY NOT NULL,
	"lemma" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

-- Create vocabulary_occurrences table with NULLS NOT DISTINCT unique constraint
CREATE TABLE "vocabulary_occurrences" (
	"id" text PRIMARY KEY NOT NULL,
	"lemma" text NOT NULL,
	"source_type" "vocab_source" NOT NULL,
	"document_id" text,
	"tcf_question_id" uuid,
	"surface" text NOT NULL,
	"sentence_context" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "vocab_occ_unique_idx" UNIQUE NULLS NOT DISTINCT("lemma","source_type","document_id","tcf_question_id")
);--> statement-breakpoint

-- Foreign key: vocabulary_aliases.lemma → vocabulary_lookups.lemma
DO $$ BEGIN
 ALTER TABLE "vocabulary_aliases" ADD CONSTRAINT "vocabulary_aliases_lemma_vocabulary_lookups_lemma_fk" FOREIGN KEY ("lemma") REFERENCES "public"."vocabulary_lookups"("lemma") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- Foreign key: vocabulary_occurrences.lemma → vocabulary_lookups.lemma
DO $$ BEGIN
 ALTER TABLE "vocabulary_occurrences" ADD CONSTRAINT "vocabulary_occurrences_lemma_vocabulary_lookups_lemma_fk" FOREIGN KEY ("lemma") REFERENCES "public"."vocabulary_lookups"("lemma") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- Foreign key: vocabulary_occurrences.document_id → documents.id
DO $$ BEGIN
 ALTER TABLE "vocabulary_occurrences" ADD CONSTRAINT "vocabulary_occurrences_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- Foreign key: vocabulary_occurrences.tcf_question_id → tcf_questions.id
DO $$ BEGIN
 ALTER TABLE "vocabulary_occurrences" ADD CONSTRAINT "vocabulary_occurrences_tcf_question_id_tcf_questions_id_fk" FOREIGN KEY ("tcf_question_id") REFERENCES "public"."tcf_questions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
