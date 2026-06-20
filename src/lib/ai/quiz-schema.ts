import { z } from "zod";

/**
 * Shape the AI must emit when structuring a raw exam document into
 * passages + questions (Sprint 8 — D-4 preview payload).
 * Phase 1 fixes `type` to "single"; widen as later phases land.
 */
export const QuizQuestionParsedSchema = z.object({
  type: z.literal("single"),
  questionText: z.string(),
  /** Exactly 4 options for TCF single-choice. */
  options: z.array(z.string()).length(4),
  /** 0-based index into options — mapped to `answer` jsonb on insert. */
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string().nullable(),
});

export const QuizPassageParsedSchema = z.object({
  text: z.string(),
  questions: z.array(QuizQuestionParsedSchema),
});

export const QuizParseSchema = z.object({
  passages: z.array(QuizPassageParsedSchema),
});

export type QuizQuestionParsed = z.infer<typeof QuizQuestionParsedSchema>;
export type QuizPassageParsed = z.infer<typeof QuizPassageParsedSchema>;
export type ParsedQuiz = z.infer<typeof QuizParseSchema>;
