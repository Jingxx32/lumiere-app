CREATE TYPE "public"."tcf_attempt_mode" AS ENUM('drill', 'exam');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tcf_question_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"mode" "tcf_attempt_mode" NOT NULL,
	"exam_attempt_id" uuid,
	"chosen" integer NOT NULL,
	"correct" boolean NOT NULL,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tcf_questions" ADD COLUMN "skill_tags" jsonb;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tcf_question_attempts" ADD CONSTRAINT "tcf_question_attempts_question_id_tcf_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."tcf_questions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tcf_question_attempts" ADD CONSTRAINT "tcf_question_attempts_exam_attempt_id_tcf_attempts_id_fk" FOREIGN KEY ("exam_attempt_id") REFERENCES "public"."tcf_attempts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tcf_qa_question_id_idx" ON "tcf_question_attempts" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tcf_qa_answered_at_idx" ON "tcf_question_attempts" USING btree ("answered_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tcf_qa_exam_attempt_id_idx" ON "tcf_question_attempts" USING btree ("exam_attempt_id");