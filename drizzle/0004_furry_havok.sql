CREATE TABLE IF NOT EXISTS "vocabulary_lookups" (
	"id" text PRIMARY KEY NOT NULL,
	"word" text NOT NULL,
	"surface" text NOT NULL,
	"pos" text,
	"translation" text,
	"cefr_level" text,
	"in_context" text,
	"examples" jsonb,
	"conjugation" text,
	"sentence_context" text,
	"document_id" text,
	"session_id" text,
	"looked_up_at" timestamp DEFAULT now() NOT NULL,
	"saved_at" timestamp,
	"review_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "vocabulary_lookups_word_unique" UNIQUE("word")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vocabulary_lookups" ADD CONSTRAINT "vocabulary_lookups_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vocabulary_lookups" ADD CONSTRAINT "vocabulary_lookups_session_id_reading_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."reading_sessions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
