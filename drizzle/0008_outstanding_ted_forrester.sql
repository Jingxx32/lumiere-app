ALTER TYPE "public"."tcf_question_type" ADD VALUE 'reading_mcq';--> statement-breakpoint
ALTER TABLE "tcf_questions" ADD COLUMN "passage" text;