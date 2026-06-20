"use server";

import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { openai, MODELS } from "./client";

const FrTextPair = z.object({ fr: z.string(), en: z.string() });

const TenseBlock = z.object({
  type: z.enum(["simple", "compound"]),
  level: z.enum(["A1", "A2", "B1", "B2"]),
  recognition_only: z.boolean().nullable().optional(),
  forms: z.record(z.string(), z.string()).nullable().optional(),
  aux_tense: z.string().nullable().optional(),
  sample: z.string().nullable().optional(),
});

const VerbSub = z.object({
  aux: z.enum(["avoir", "être"]),
  past_participle: z.string(),
  pp_agrees: z.boolean(),
  focus_tenses: z.array(z.string()),
  focus_reason: z.string().nullable(),
  tenses: z.record(z.string(), TenseBlock),
});

const FrenchVocabEntrySchema = z.object({
  id: z.string(),
  word: z.string(),
  pos: z.enum(["verb", "noun", "adjective", "adverb", "preposition", "expression"]),
  level: z.enum(["A1", "A2", "B1", "B2"]),
  gender: z.enum(["m", "f"]).nullable(),
  meaning_en: z.string(),
  collocations: z.array(FrTextPair),
  example: FrTextPair,
  canada_note: z.string().nullable(),
  verb: VerbSub.nullable(),
});

export type FrenchVocabEntry = z.infer<typeof FrenchVocabEntrySchema>;

export async function enrichVocab(lemma: string, posHint: string | null): Promise<FrenchVocabEntry> {
  const completion = await openai.chat.completions.parse({
    model: MODELS.task,
    messages: [
      {
        role: "system",
        content: `You produce a structured French vocabulary entry for a TCF Canada (A1–B2) learner, English glosses.
Follow these rules exactly:
- id: "fr_" + slugified lemma.
- For verbs: fill the verb sub-object. Store SIMPLE tenses (present, imparfait, futur_simple, conditionnel_present, subjonctif_present, passe_simple) with all six person forms (je/tu/il/nous/vous/ils; subjonctif uses que_je/que_tu/qu_il/que_nous/que_vous/qu_ils). passe_simple is recognition_only with only il/ils.
- For COMPOUND tenses (passe_compose, plus_que_parfait, conditionnel_passe, subjonctif_passe) store only { type:"compound", level, aux_tense, sample } — no forms.
- Do NOT include futur_proche.
- Per-tense level uses the default tense→level map; override earlier only when genuinely taught earlier (être/avoir imparfait → A1).
- collocations: only genuine high-frequency ones, else [].
- canada_note: only when Québec usage differs, else null.
- For non-verbs: verb = null; fill gender for nouns.`,
      },
      {
        role: "user",
        content: `Lemma: "${lemma}"${posHint ? `\nLikely part of speech: ${posHint}` : ""}`,
      },
    ],
    response_format: zodResponseFormat(FrenchVocabEntrySchema, "vocab_entry"),
    temperature: 0.2,
  });
  const parsed = completion.choices[0].message.parsed;
  if (!parsed) throw new Error("No result from OpenAI enrich");
  return parsed;
}
