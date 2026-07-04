CREATE INDEX IF NOT EXISTS "conjugation_attempts_verb_tense_idx" ON "conjugation_attempts" USING btree ("verb","tense");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "errors_submission_id_idx" ON "errors" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "errors_category_subcategory_idx" ON "errors" USING btree ("category","subcategory");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "errors_created_at_idx" ON "errors" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "micro_drills_error_id_idx" ON "micro_drills" USING btree ("error_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quiz_attempts_set_id_idx" ON "quiz_attempts" USING btree ("set_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quiz_passages_set_id_idx" ON "quiz_passages" USING btree ("set_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quiz_questions_passage_id_idx" ON "quiz_questions" USING btree ("passage_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "submissions_task_id_idx" ON "submissions" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tcf_questions_set_id_idx" ON "tcf_questions" USING btree ("set_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vocab_occ_lemma_idx" ON "vocabulary_occurrences" USING btree ("lemma");