"use server";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { writingTasks, submissions, documents, errors } from "@/lib/db/schema";
import { generateTask } from "@/lib/ai/task";
import { generateFeedback } from "@/lib/ai/feedback";
import { countWords } from "@/lib/cefr";
import { buildLearnerProfile } from "@/lib/actions/learner-profile";
import { ERROR_TAXONOMY } from "@/lib/taxonomy";
import type { ErrorCategory } from "@/lib/taxonomy";

const ARCHIVE_PLACEHOLDER_TITLE = "(Targeted practice from your error archive)";
const ARCHIVE_PLACEHOLDER_TYPE = "personal";
const ARCHIVE_PLACEHOLDER_CONTENT =
  "This task is generated from the student's error archive, not a specific document.";

export type GenerateTaskOptions = {
  /** Subcategory ids forced into the final `target_grammar` (pinned-first, capped at 3). */
  pinnedGrammar?: string[];
  /** For logging/debug only — task generation source. */
  source?: "document" | "vocab" | "archive";
};

export async function generateWritingTask(
  documentId: string | null,
  vocabWords: string[] = [],
  opts?: GenerateTaskOptions,
): Promise<string> {
  const [doc, profile] = await Promise.all([
    documentId
      ? db
          .select()
          .from(documents)
          .where(eq(documents.id, documentId))
          .limit(1)
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
    buildLearnerProfile(),
  ]);

  if (documentId && !doc) throw new Error("Document not found");

  const result = await generateTask(
    doc?.title ?? ARCHIVE_PLACEHOLDER_TITLE,
    doc?.type ?? ARCHIVE_PLACEHOLDER_TYPE,
    doc?.content ?? ARCHIVE_PLACEHOLDER_CONTENT,
    doc?.estimatedLevel ?? profile.cefrLevel,
    vocabWords,
    { profile },
  );

  // Enforce target_words constraint (PRD §7.3.3):
  // Must be a subset of collected vocab; ≤5 words → use all; >5 → AI picks subset (min 3).
  let targetWords = result.target_words;
  if (vocabWords.length > 0) {
    const collected = vocabWords.map((w) => w.toLowerCase());
    const filtered = targetWords.filter((w) => collected.includes(w.toLowerCase()));
    if (vocabWords.length <= 5) {
      targetWords = vocabWords;
    } else {
      targetWords = filtered.length >= 3 ? filtered : vocabWords.slice(0, 3);
    }
  }

  // Pinned grammar overrides AI's picks: pinned first, then AI's choices, capped at 3.
  let targetGrammar = result.target_grammar;
  if (opts?.pinnedGrammar && opts.pinnedGrammar.length > 0) {
    targetGrammar = [
      ...new Set([...opts.pinnedGrammar, ...result.target_grammar]),
    ].slice(0, 3);
  }

  const id = randomUUID();
  await db.insert(writingTasks).values({
    id,
    documentId: documentId ?? null,
    promptEn: result.prompt_en,
    targetWords,
    targetGrammar,
    difficulty: result.difficulty,
    minWordCount: result.min_word_count,
    maxWordCount: result.max_word_count,
  });

  return id;
}

/* ------------------------------------------------------------------ */
/*  practiceFromPattern — Practice button on Progress page             */
/* ------------------------------------------------------------------ */

export async function practiceFromPattern(
  category: ErrorCategory,
  subcategory: string,
): Promise<string> {
  const def = ERROR_TAXONOMY[category];
  if (!def) throw new Error("Unknown error category.");
  const hasSub = Object.prototype.hasOwnProperty.call(
    def.subcategories,
    subcategory,
  );
  if (!hasSub) throw new Error("Unknown subcategory for this category.");

  const taskId = await generateWritingTask(null, [], {
    pinnedGrammar: [subcategory],
    source: "archive",
  });

  revalidatePath("/practice");
  revalidatePath("/progress");
  return taskId;
}

export async function createSubmission(taskId: string, contentFr: string): Promise<void> {
  // NFC-normalise so AI-returned character offsets line up with accented chars
  const normalised = contentFr.normalize("NFC");
  const id = randomUUID();

  // Phase 1 — persist the submission immediately so the user never loses their writing
  await db.insert(submissions).values({
    id,
    taskId,
    contentFr: normalised,
    wordCount: countWords(normalised),
  });

  // Fetch task context for the feedback prompt
  const task = await db
    .select()
    .from(writingTasks)
    .where(eq(writingTasks.id, taskId))
    .limit(1)
    .then((r) => r[0] ?? null);

  if (task) {
    try {
      // Phase 2 — generate structured feedback
      const feedback = await generateFeedback(
        task.promptEn,
        (task.targetWords as string[]) ?? [],
        (task.targetGrammar as string[]) ?? [],
        task.difficulty ?? "B1",
        normalised,
      );

      // Persist raw packet + top-level fields onto the submission
      await db
        .update(submissions)
        .set({
          feedbackJson: feedback,
          estimatedLevel: feedback.overall_level_estimate,
          praise: feedback.praise,
          summaryEn: feedback.summary_en,
        })
        .where(eq(submissions.id, id));

      // Bulk-insert classified errors (improvements stay in feedbackJson only)
      if (feedback.errors.length > 0) {
        await db.insert(errors).values(
          feedback.errors.map((err) => ({
            id: randomUUID(),
            submissionId: id,
            spanStart: Math.max(0, err.span.start),
            spanEnd: Math.min(normalised.length, err.span.end),
            original: err.original,
            correction: err.correction,
            category: err.category,
            subcategory: err.subcategory,
            triggerContext: err.trigger_context,
            explanationEn: err.explanation_en,
            frExamples: err.fr_examples,
            ruleId: err.rule_id,
            microDrill: err.micro_drill,
          })),
        );
      }
    } catch (err) {
      // Submission is already saved; proceed so the user can see their writing.
      // feedbackJson remains null — the page shows a retry affordance.
      console.error("Feedback generation failed:", err);
    }
  }

  redirect(`/practice/${id}/feedback`);
}

export async function getWritingTaskWithDocument(id: string) {
  const task = await db
    .select()
    .from(writingTasks)
    .where(eq(writingTasks.id, id))
    .limit(1)
    .then((r) => r[0]);
  if (!task) return null;
  const doc = task.documentId
    ? await db
        .select()
        .from(documents)
        .where(eq(documents.id, task.documentId))
        .limit(1)
        .then((r) => r[0] ?? null)
    : null;
  return { task, doc };
}

export async function getSubmissionWithFeedback(submissionId: string) {
  const submission = await db
    .select()
    .from(submissions)
    .where(eq(submissions.id, submissionId))
    .limit(1)
    .then((r) => r[0] ?? null);
  if (!submission) return null;

  const task = await db
    .select()
    .from(writingTasks)
    .where(eq(writingTasks.id, submission.taskId))
    .limit(1)
    .then((r) => r[0] ?? null);

  const doc =
    task?.documentId
      ? await db
          .select()
          .from(documents)
          .where(eq(documents.id, task.documentId))
          .limit(1)
          .then((r) => r[0] ?? null)
      : null;

  const errorList = await db
    .select()
    .from(errors)
    .where(eq(errors.submissionId, submissionId));

  return { submission, task, doc, errors: errorList };
}
