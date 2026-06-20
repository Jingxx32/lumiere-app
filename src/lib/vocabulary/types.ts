/**
 * Vocabulary feature types — exported from a plain (non-"use server") module
 * so they can be imported by both server actions and client components.
 */

import type { FrenchVocabEntry } from "@/lib/ai/enrich";

export type { FrenchVocabEntry };

export type LookupSource =
  | { type: "reading"; documentId: string }
  | { type: "tcf"; tcfQuestionId: string };

export type OccurrenceLink = {
  sourceType: "reading" | "tcf";
  documentId: string | null;
  tcfQuestionId: string | null;
  surface: string;
  sentenceContext: string | null;
};

export type VocabEntrySummary = {
  lemma: string;
  surface: string;
  pos: string | null;
  cefrLevel: string | null;
  translation: string | null;
  saved: boolean;
  enriched: boolean;
};

export type VocabEntryDetail = VocabEntrySummary & {
  inContext: string | null;
  examples: string[];
  conjugation: string | null;
  richEntry: FrenchVocabEntry | null;
  occurrences: OccurrenceLink[];
};
