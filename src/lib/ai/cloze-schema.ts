import { z } from "zod";

/**
 * Payload that travels import dialog → preview → confirm for podcast cloze
 * (Sprint 9 — D-4 preview payload, mirroring quiz-schema.ts).
 * Re-parsed server-side at confirm time; never trust the client copy.
 */
export const ClozeBlankParsedSchema = z.object({
  /** Context line with ____ in place of the blanked word. */
  questionText: z.string(),
  /** Acceptable spellings; [0] is the canonical surface form. */
  answer: z.array(z.string().min(1)).min(1),
  /** Padded loop window in whole seconds (D-6: timestamps, not audio cuts). */
  audioStart: z.number().int().min(0),
  audioEnd: z.number().int().min(0),
});

export const ClozePayloadSchema = z.object({
  transcript: z.string().min(1),
  durationSec: z.number().int().min(0),
  blanks: z.array(ClozeBlankParsedSchema).min(1),
});

export type ClozeBlankParsed = z.infer<typeof ClozeBlankParsedSchema>;
export type ClozePayload = z.infer<typeof ClozePayloadSchema>;
