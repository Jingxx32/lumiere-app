"use server";

import { eq, and, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { vocabularyLookups, vocabularyOccurrences } from "@/lib/db/schema";
import type { LookupResult } from "@/lib/ai/lookup";
import { norm, upsertEntry, upsertAlias, recordOccurrence, resolveLemma } from "@/lib/vocabulary/helpers";

/** Legacy reading entry point — keeps reader-client compiling until Task 3. */
export async function upsertVocabularyLookup(
  word: string,
  surface: string,
  result: LookupResult,
  documentId: string,
  _sessionId: string,
  sentenceContext: string,
): Promise<void> {
  const lemma = norm(result.lemma || word);
  await upsertEntry(lemma, surface, result);
  await upsertAlias(norm(surface), lemma);
  await recordOccurrence({
    lemma,
    surface,
    sentenceContext,
    sourceType: "reading",
    documentId,
  });
}

export async function saveVocabularyWord(word: string): Promise<void> {
  const lemma = (await resolveLemma(word)) ?? norm(word);
  await db
    .update(vocabularyLookups)
    .set({ savedAt: new Date() })
    .where(eq(vocabularyLookups.lemma, lemma));
}

export async function getSavedWordsByDocument(documentId: string): Promise<string[]> {
  const rows = await db
    .select({ lemma: vocabularyOccurrences.lemma })
    .from(vocabularyOccurrences)
    .innerJoin(vocabularyLookups, eq(vocabularyOccurrences.lemma, vocabularyLookups.lemma))
    .where(
      and(
        eq(vocabularyOccurrences.documentId, documentId),
        isNotNull(vocabularyLookups.savedAt),
      ),
    );
  return Array.from(new Set(rows.map((r) => r.lemma)));
}
