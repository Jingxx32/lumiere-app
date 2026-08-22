ALTER TYPE "public"."tcf_attempt_mode" ADD VALUE 'review' BEFORE 'exam';--> statement-breakpoint
ALTER TABLE "tcf_question_attempts" ADD COLUMN "uncertain" boolean DEFAULT false NOT NULL;