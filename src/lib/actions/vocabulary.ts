"use server";

import { after } from "next/server";
import { eq, and, isNotNull, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  vocabularyLookups,
  vocabularyOccurrences,
  documents,
  tcfQuestions,
  tcfSets,
} from "@/lib/db/schema";
import type { LookupResult } from "@/lib/ai/lookup";
import { lookupWord } from "@/lib/ai/lookup";
import { enrichVocab, type FrenchVocabEntry } from "@/lib/ai/enrich";
import { norm, upsertEntry, upsertAlias, recordOccurrence, resolveLemma } from "@/lib/vocabulary/helpers";
import type { LookupSource, OccurrenceLink, VocabEntrySummary, VocabEntryDetail } from "@/lib/vocabulary/types";

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export type { LookupSource, OccurrenceLink, VocabEntrySummary, VocabEntryDetail } from "@/lib/vocabulary/types";

/* ------------------------------------------------------------------ */
/*  Cache-first lookup                                                  */
/* ------------------------------------------------------------------ */

export async function resolveLookup(
  surface: string,
  sentenceContext: string,
  source: LookupSource,
): Promise<{ lemma: string; surface: string; result: LookupResult; cached: boolean }> {
  const lemma = await resolveLemma(surface);

  // Cache hit — zero AI
  if (lemma) {
    const row = (
      await db.select().from(vocabularyLookups).where(eq(vocabularyLookups.lemma, lemma)).limit(1)
    )[0];
    if (row) {
      await recordOccurrence({
        lemma,
        surface,
        sentenceContext,
        sourceType: source.type,
        documentId: source.type === "reading" ? source.documentId : null,
        tcfQuestionId: source.type === "tcf" ? source.tcfQuestionId : null,
      });
      const result: LookupResult = {
        lemma: row.lemma,
        pos: row.pos ?? "",
        level: (row.cefrLevel ?? "A1") as LookupResult["level"],
        translation: row.translation ?? "",
        in_context: row.inContext ?? "",
        examples: (row.examples as string[]) ?? [],
      };
      return { lemma, surface, result, cached: true };
    }
  }

  // Cache miss — Tier 1 AI
  const result = await lookupWord(surface, sentenceContext);
  const resolved = norm(result.lemma || surface);
  await upsertEntry(resolved, surface, result);
  await upsertAlias(norm(surface), resolved);
  await recordOccurrence({
    lemma: resolved,
    surface,
    sentenceContext,
    sourceType: source.type,
    documentId: source.type === "reading" ? source.documentId : null,
    tcfQuestionId: source.type === "tcf" ? source.tcfQuestionId : null,
  });
  return { lemma: resolved, surface, result, cached: false };
}

export async function reexplainInContext(lemma: string, sentenceContext: string): Promise<string> {
  const r = await lookupWord(lemma, sentenceContext);
  return r.in_context;
}

/* ------------------------------------------------------------------ */
/*  Save + enrich                                                       */
/* ------------------------------------------------------------------ */

export async function saveVocabularyWord(word: string): Promise<void> {
  const lemma = (await resolveLemma(word)) ?? norm(word);
  await db
    .update(vocabularyLookups)
    .set({ savedAt: new Date() })
    .where(eq(vocabularyLookups.lemma, lemma));
  // Enrich after the response is sent (Next's official post-response hook), so
  // the save returns instantly and the work is still guaranteed to run.
  after(async () => {
    try {
      await enrichEntry(lemma);
    } catch (err) {
      console.error(`enrich failed for "${lemma}":`, err);
    }
  });
}

export async function enrichEntry(lemma: string): Promise<void> {
  const row = (
    await db.select().from(vocabularyLookups).where(eq(vocabularyLookups.lemma, lemma)).limit(1)
  )[0];
  if (!row) return;
  const rich = await enrichVocab(lemma, row.pos);
  await db
    .update(vocabularyLookups)
    .set({ richEntry: rich, enrichedAt: new Date() })
    .where(eq(vocabularyLookups.lemma, lemma));
}

/* ------------------------------------------------------------------ */
/*  Library queries                                                     */
/* ------------------------------------------------------------------ */

export async function getVocabEntries(
  filter: { savedOnly?: boolean } = {},
): Promise<VocabEntrySummary[]> {
  // Summary columns only — never pull the (potentially multi-KB) richEntry jsonb
  // for the list view.
  const rows = await db
    .select({
      lemma: vocabularyLookups.lemma,
      surface: vocabularyLookups.surface,
      pos: vocabularyLookups.pos,
      cefrLevel: vocabularyLookups.cefrLevel,
      translation: vocabularyLookups.translation,
      savedAt: vocabularyLookups.savedAt,
      enrichedAt: vocabularyLookups.enrichedAt,
    })
    .from(vocabularyLookups)
    .where(filter.savedOnly ? isNotNull(vocabularyLookups.savedAt) : undefined)
    .orderBy(desc(vocabularyLookups.lookedUpAt));
  return rows.map((r) => ({
    lemma: r.lemma,
    surface: r.surface,
    pos: r.pos,
    cefrLevel: r.cefrLevel,
    translation: r.translation,
    saved: r.savedAt != null,
    enriched: r.enrichedAt != null,
  }));
}

export async function getVocabEntryDetail(lemma: string): Promise<VocabEntryDetail | null> {
  const row = (
    await db.select().from(vocabularyLookups).where(eq(vocabularyLookups.lemma, lemma)).limit(1)
  )[0];
  if (!row) return null;
  const occ = await db
    .select({
      sourceType: vocabularyOccurrences.sourceType,
      documentId: vocabularyOccurrences.documentId,
      documentTitle: documents.title,
      tcfQuestionId: vocabularyOccurrences.tcfQuestionId,
      tcfTestNumber: tcfSets.testNumber,
      tcfOrderIndex: tcfQuestions.orderIndex,
      surface: vocabularyOccurrences.surface,
      sentenceContext: vocabularyOccurrences.sentenceContext,
    })
    .from(vocabularyOccurrences)
    .leftJoin(documents, eq(vocabularyOccurrences.documentId, documents.id))
    .leftJoin(tcfQuestions, eq(vocabularyOccurrences.tcfQuestionId, tcfQuestions.id))
    .leftJoin(tcfSets, eq(tcfQuestions.setId, tcfSets.id))
    .where(eq(vocabularyOccurrences.lemma, lemma))
    .orderBy(desc(vocabularyOccurrences.createdAt));
  return {
    lemma: row.lemma,
    surface: row.surface,
    pos: row.pos,
    cefrLevel: row.cefrLevel,
    translation: row.translation,
    saved: row.savedAt != null,
    enriched: row.enrichedAt != null,
    inContext: row.inContext,
    examples: (row.examples as string[]) ?? [],
    conjugation: row.conjugation,
    richEntry: (row.richEntry as FrenchVocabEntry | null) ?? null,
    occurrences: occ.map((o) => ({
      sourceType: o.sourceType,
      documentId: o.documentId,
      documentTitle: o.documentTitle,
      tcfQuestionId: o.tcfQuestionId,
      tcfTestNumber: o.tcfTestNumber,
      tcfOrderIndex: o.tcfOrderIndex,
      surface: o.surface,
      sentenceContext: o.sentenceContext,
    })),
  };
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
