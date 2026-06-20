# Vocabulary Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user select any word in a reading article or a TCF question/option, look it up via AI, persist it to one unified lemma-keyed vocabulary library that is preferred on future lookups, and browse it on a new Vocabulary page that links each word back to where it appeared.

**Architecture:** Three layers. (1) A **data layer** — reshaped `vocabulary_lookups` (lemma-keyed) plus new `vocabulary_aliases` (surface→lemma, enables cache-first) and `vocabulary_occurrences` (many-to-many source links). (2) A **server layer** — `resolveLookup` (cache-first via aliases), `reexplainInContext`, `saveVocabularyWord` (triggers Tier-2 `enrichEntry`), and library queries. (3) A **UI layer** — a generalised selection popover mounted by both the reader and the TCF drill, plus a new `/vocabulary` page.

**Tech Stack:** Next.js (app router, server actions — read `node_modules/next/dist/docs/` before writing Next code, per AGENTS.md), Drizzle ORM + node-postgres (all queries async), OpenAI structured output via `zodResponseFormat`, Tailwind with semantic tokens, `cva`/`cn` UI primitives.

## Global Constraints

- **No test suite exists** (CLAUDE.md). TDD's test-runner cycle does not apply; the user's instructions override the default. Each task's gate is: `npm run lint` clean, `npm run build` green, and — for data tasks — `npm run db:init` applying, and — for UI tasks — a manual `preview_*` check. Verbatim from spec §7: "Verify manually with `preview_*`."
- **Drizzle is async** — use `await db.select()…` / `.insert()` / `.update()`; never `.run()`/`.get()`/`.all()` (CLAUDE.md).
- **Schema is the single source of truth**; after any schema edit run `npm run db:generate` then `npm run db:init` (CLAUDE.md).
- **Semantic design tokens only** — `text-muted-foreground`, `bg-surface`, `border-border`, `text-accent`, etc. Never raw colours (CLAUDE.md).
- **Fonts** — `font-serif` for French/display content, `font-sans` for UI chrome (CLAUDE.md).
- **Rich entry schema** must mirror `verb_schema_spec.md` (the file at repo root the user provided) — §9 JSON Schema is the contract; §6 is the level-gating rule.
- **Env**: OpenAI via existing `openai`/`MODELS` from `src/lib/ai/client.ts`. Learner level via `getCefrLevel()` (`src/lib/actions/settings.ts`).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/db/schema.ts` | reshape `vocabularyLookups`; add `vocabSourceEnum`, `vocabularyAliases`, `vocabularyOccurrences` |
| `src/lib/ai/lookup.ts` | Tier-1: add `lemma` to schema + prompt |
| `src/lib/ai/enrich.ts` *(new)* | Tier-2: `FrenchVocabEntry` Zod schema + `enrichEntry()` |
| `src/lib/actions/vocabulary.ts` | `resolveLookup`, `reexplainInContext`, `saveVocabularyWord`, `getVocabEntries`, `getVocabEntryDetail`; alias + occurrence writes |
| `src/hooks/use-text-selection.ts` *(new)* | extracted selection → `{ text, sentenceContext, rect }` |
| `src/components/word-lookup-popover.tsx` *(moved/new)* | generalised popover (container ref + source) |
| `src/app/(main)/documents/[id]/_components/reader-client.tsx` | use generalised popover + `resolveLookup` |
| `src/app/tcf/_components/drill-runner.tsx` | wrap question + options; mount popover (tcf source) |
| `src/app/tcf/drill/page.tsx` | accept `?q=` deep-link |
| `src/app/(main)/vocabulary/page.tsx` + `_components/*` *(new)* | library list + detail + source links |
| `src/lib/vocab/display.ts` *(new)* | §6 level-gating helpers (pure, shareable) |
| `src/components/sidebar.tsx` | add Vocabulary nav entry |

---

## Task 1: Data layer — schema, migration, lemma-keyed actions

Reshapes the table and rewrites the existing actions so the **reading flow keeps working unchanged** (same action signatures) on the new lemma model. New library/resolve functions come in Task 2.

**Files:**
- Modify: `src/lib/db/schema.ts` (`vocabularyLookups` ~169-189; add enum + 2 tables)
- Modify: `src/lib/ai/lookup.ts` (add `lemma`)
- Modify: `src/lib/actions/vocabulary.ts` (rewrite the 3 existing functions onto the new model)
- Migration: `drizzle/` (generated)

**Interfaces:**
- Produces: `vocabularyLookups` (PK `lemma`-keyed via unique `lemma` col), `vocabularyAliases`, `vocabularyOccurrences`, `vocabSourceEnum`. `lookupWord` now returns `LookupResult` including `lemma: string`. Existing action signatures unchanged: `upsertVocabularyLookup(word, surface, result, documentId, sessionId, sentenceContext)`, `saveVocabularyWord(word)`, `getSavedWordsByDocument(documentId)`.

- [ ] **Step 1: Edit `schema.ts` — reshape `vocabularyLookups`**

Replace the existing `vocabularyLookups` block (currently lines ~169-189) with:

```ts
export const vocabularyLookups = pgTable("vocabulary_lookups", {
  id: text("id").primaryKey(),
  /** NFC-lowercased dictionary lemma — global dedupe key */
  lemma: text("lemma").notNull().unique(),
  /** First-seen surface form (original casing) */
  surface: text("surface").notNull(),
  pos: text("pos"),
  translation: text("translation"),
  cefrLevel: text("cefr_level"),
  inContext: text("in_context"),
  /** JSON string[] of example sentences */
  examples: jsonb("examples"),
  conjugation: text("conjugation"),
  sentenceContext: text("sentence_context"),
  /** Full FrenchVocabEntry per verb_schema_spec.md — null until enriched */
  richEntry: jsonb("rich_entry"),
  enrichedAt: timestamp("enriched_at"),
  lookedUpAt: timestamp("looked_up_at").notNull().defaultNow(),
  /** null = looked up only; non-null = explicitly saved */
  savedAt: timestamp("saved_at"),
  reviewCount: integer("review_count").notNull().default(0),
});

export type VocabularyLookup = typeof vocabularyLookups.$inferSelect;
```

- [ ] **Step 2: Edit `schema.ts` — add enum + alias + occurrence tables**

Add directly after the `VocabularyLookup` type. (`pgEnum`, `uniqueIndex` are already imported in this file.)

```ts
export const vocabSourceEnum = pgEnum("vocab_source", ["reading", "tcf"]);

export const vocabularyAliases = pgTable("vocabulary_aliases", {
  /** NFC + lowercase surface form, e.g. "fait" */
  surface: text("surface").primaryKey(),
  lemma: text("lemma")
    .notNull()
    .references(() => vocabularyLookups.lemma, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const vocabularyOccurrences = pgTable(
  "vocabulary_occurrences",
  {
    id: text("id").primaryKey(),
    lemma: text("lemma")
      .notNull()
      .references(() => vocabularyLookups.lemma, { onDelete: "cascade" }),
    sourceType: vocabSourceEnum("source_type").notNull(),
    documentId: text("document_id").references(() => documents.id, { onDelete: "set null" }),
    tcfQuestionId: text("tcf_question_id").references(() => tcfQuestions.id, { onDelete: "cascade" }),
    surface: text("surface").notNull(),
    sentenceContext: text("sentence_context"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("vocab_occ_unique_idx")
      .on(t.lemma, t.sourceType, t.documentId, t.tcfQuestionId)
      .nullsNotDistinct(),
  ],
);

export type VocabularyOccurrence = typeof vocabularyOccurrences.$inferSelect;
```

> `nullsNotDistinct()` is required — the always-null source column would otherwise make every row unique and break dedupe (spec §3.3).

- [ ] **Step 3: Edit `lookup.ts` — add `lemma` to schema + prompt**

In `src/lib/ai/lookup.ts`, add `lemma` to `LookupSchema` (first field) and a prompt line.

```ts
const LookupSchema = z.object({
  lemma: z.string(),
  pos: z.string(),
  level: z.enum(CEFR_LEVELS),
  translation: z.string(),
  conjugation: z.string().nullable(),
  in_context: z.string(),
  examples: z.array(z.string()),
});
```

Add to the system prompt's "Fields to return" list (before `pos`):

```
- lemma: the dictionary base form — infinitive for verbs, masculine singular for adjectives, singular for nouns; lowercased. For non-inflecting words, the word itself.
```

- [ ] **Step 4: Rewrite `vocabulary.ts` — adapt existing 3 functions to the new model**

Replace the whole file. Keeps the three existing signatures so `reader-client.tsx` still compiles; adds private helpers used again in Task 2.

```ts
"use server";

import { randomUUID } from "node:crypto";
import { eq, and, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  vocabularyLookups,
  vocabularyAliases,
  vocabularyOccurrences,
} from "@/lib/db/schema";
import type { LookupResult } from "@/lib/ai/lookup";

const norm = (s: string) => s.toLowerCase().normalize("NFC").trim();

/** Upsert the lemma entry (never overwrites richEntry/savedAt/enrichedAt). */
async function upsertEntry(lemma: string, surface: string, result: LookupResult) {
  await db
    .insert(vocabularyLookups)
    .values({
      id: randomUUID(),
      lemma,
      surface,
      pos: result.pos,
      translation: result.translation,
      cefrLevel: result.level,
      inContext: result.in_context,
      examples: result.examples,
      conjugation: result.conjugation ?? null,
      sentenceContext: "",
      lookedUpAt: new Date(),
    })
    .onConflictDoUpdate({
      target: vocabularyLookups.lemma,
      set: {
        pos: result.pos,
        translation: result.translation,
        cefrLevel: result.level,
        inContext: result.in_context,
        examples: result.examples,
        conjugation: result.conjugation ?? null,
        lookedUpAt: new Date(),
      },
    });
}

async function upsertAlias(surface: string, lemma: string) {
  await db
    .insert(vocabularyAliases)
    .values({ surface, lemma, createdAt: new Date() })
    .onConflictDoNothing();
}

async function recordOccurrence(opts: {
  lemma: string;
  surface: string;
  sentenceContext: string;
  sourceType: "reading" | "tcf";
  documentId?: string | null;
  tcfQuestionId?: string | null;
}) {
  await db
    .insert(vocabularyOccurrences)
    .values({
      id: randomUUID(),
      lemma: opts.lemma,
      surface: opts.surface,
      sentenceContext: opts.sentenceContext,
      sourceType: opts.sourceType,
      documentId: opts.documentId ?? null,
      tcfQuestionId: opts.tcfQuestionId ?? null,
      createdAt: new Date(),
    })
    .onConflictDoNothing();
}

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

/** Resolve a surface (or lemma) to its lemma via the alias table. */
async function resolveLemma(surface: string): Promise<string | null> {
  const s = norm(surface);
  const direct = await db
    .select({ lemma: vocabularyLookups.lemma })
    .from(vocabularyLookups)
    .where(eq(vocabularyLookups.lemma, s))
    .limit(1);
  if (direct[0]) return direct[0].lemma;
  const alias = await db
    .select({ lemma: vocabularyAliases.lemma })
    .from(vocabularyAliases)
    .where(eq(vocabularyAliases.surface, s))
    .limit(1);
  return alias[0]?.lemma ?? null;
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

export { norm, upsertEntry, upsertAlias, recordOccurrence, resolveLemma };
```

- [ ] **Step 5: Generate + apply the migration**

Run:
```bash
npm run db:generate && npm run db:init
```
Expected: a new `drizzle/0009_*.sql` is created and `db:init` reports migrations applied with no error.

> If `db:init` fails because the renamed `word`→`lemma` column collides with existing data, that is expected per spec §6 (legacy rows not migrated). Clear the table first:
> ```bash
> npm run db:studio   # then truncate vocabulary_lookups
> ```
> or, equivalently, drop rows via a one-off query, then re-run `npm run db:init`.

- [ ] **Step 6: Lint + build**

Run:
```bash
npm run lint && npm run build
```
Expected: both pass. `reader-client.tsx` compiles unchanged (same action signatures).

- [ ] **Step 7: Commit**

```bash
git add src/lib/db/schema.ts src/lib/ai/lookup.ts src/lib/actions/vocabulary.ts drizzle/
git commit -m "feat(vocab): lemma-keyed schema + alias/occurrence tables"
```

---

## Task 2: Server layer — resolveLookup, reexplain, enrich, library queries

Pure additions on top of Task 1.

**Files:**
- Create: `src/lib/ai/enrich.ts`
- Modify: `src/lib/actions/vocabulary.ts` (add functions; extend `saveVocabularyWord`)

**Interfaces:**
- Consumes: `lookupWord`, `LookupResult.lemma`, and Task-1 helpers (`norm`, `upsertEntry`, `upsertAlias`, `recordOccurrence`, `resolveLemma`).
- Produces:
  - `type LookupSource = { type: "reading"; documentId: string } | { type: "tcf"; tcfQuestionId: string }`
  - `resolveLookup(surface: string, sentenceContext: string, source: LookupSource): Promise<{ lemma: string; surface: string; result: LookupResult; cached: boolean }>`
  - `reexplainInContext(lemma: string, sentenceContext: string): Promise<string>`
  - `saveVocabularyWord(word: string): Promise<void>` (now also triggers enrichment)
  - `enrichEntry(lemma: string): Promise<void>`
  - `getVocabEntries(filter?: { savedOnly?: boolean }): Promise<VocabEntrySummary[]>`
  - `getVocabEntryDetail(lemma: string): Promise<VocabEntryDetail | null>`
  - Types `VocabEntrySummary`, `VocabEntryDetail`, `OccurrenceLink`, `FrenchVocabEntry`.

- [ ] **Step 1: Create `src/lib/ai/enrich.ts` (Tier-2 schema + call)**

Zod mirror of `verb_schema_spec.md` §9. Tense blocks are loose (`additionalProperties`-style) — model as a record of objects.

```ts
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

export const FrenchVocabEntrySchema = z.object({
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
```

- [ ] **Step 2: Add `resolveLookup` + `reexplainInContext` to `vocabulary.ts`**

Append to `src/lib/actions/vocabulary.ts` (imports: add `lookupWord` and `inArray`/`desc` from drizzle as needed; add `enrichVocab, type FrenchVocabEntry` import).

```ts
import { lookupWord } from "@/lib/ai/lookup";
import { enrichVocab, type FrenchVocabEntry } from "@/lib/ai/enrich";
import { desc } from "drizzle-orm";

export type LookupSource =
  | { type: "reading"; documentId: string }
  | { type: "tcf"; tcfQuestionId: string };

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
        conjugation: row.conjugation,
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
```

- [ ] **Step 3: Extend `saveVocabularyWord` to trigger enrichment, add `enrichEntry`**

Replace the `saveVocabularyWord` body from Task 1 with one that also kicks enrichment, and add `enrichEntry`.

```ts
export async function saveVocabularyWord(word: string): Promise<void> {
  const lemma = (await resolveLemma(word)) ?? norm(word);
  await db.update(vocabularyLookups).set({ savedAt: new Date() }).where(eq(vocabularyLookups.lemma, lemma));
  // Fire-and-forget enrichment; failure leaves the flat entry intact.
  void enrichEntry(lemma).catch(() => {});
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
```

- [ ] **Step 4: Add library query functions + types**

Append to `vocabulary.ts`.

```ts
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

export async function getVocabEntries(
  filter: { savedOnly?: boolean } = {},
): Promise<VocabEntrySummary[]> {
  const rows = await db
    .select()
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
    .select()
    .from(vocabularyOccurrences)
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
      tcfQuestionId: o.tcfQuestionId,
      surface: o.surface,
      sentenceContext: o.sentenceContext,
    })),
  };
}
```

- [ ] **Step 5: Lint + build**

Run:
```bash
npm run lint && npm run build
```
Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai/enrich.ts src/lib/actions/vocabulary.ts
git commit -m "feat(vocab): cache-first resolveLookup, enrich, library queries"
```

---

## Task 3: Generalised selection popover + reading rewire

Extract selection logic into a hook and make the popover container-agnostic; switch reading onto `resolveLookup`.

**Files:**
- Create: `src/hooks/use-text-selection.ts`
- Create: `src/components/word-lookup-popover.tsx` (generalised; replaces the document-scoped one)
- Delete: `src/app/(main)/documents/[id]/_components/word-lookup-popover.tsx`
- Modify: `src/app/(main)/documents/[id]/_components/reader-client.tsx`

**Interfaces:**
- Consumes: `resolveLookup`, `reexplainInContext`, `saveVocabularyWord`, `LookupSource`, `LookupResult`.
- Produces:
  - `useTextSelection(containerRef, onSelect: (sel: { text: string; sentenceContext: string; rect: DOMRect }) => void)`
  - `<WordLookupPopover containerRef={...} source={LookupSource} savedLemmas={string[]} onSaved={(lemma)=>void} />` — self-contained: calls `resolveLookup` on selection, renders the card, Save + re-explain.

- [ ] **Step 1: Create `src/hooks/use-text-selection.ts`**

Port the selection guard + sentence-context logic from the current popover (it currently lives in `word-lookup-popover.tsx` lines ~28-71). Generalise the context container: use `closest("p, li, td, [data-selectable]")` so it works for TCF options too.

```ts
"use client";

import { useEffect } from "react";

export type TextSelection = { text: string; sentenceContext: string; rect: DOMRect };

export function useTextSelection(
  containerRef: React.RefObject<HTMLElement | null>,
  onSelect: (sel: TextSelection | null) => void,
  ignoreRef?: React.RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function handleMouseUp(e: MouseEvent) {
      if (ignoreRef?.current?.contains(e.target as Node)) return;
      const selection = window.getSelection();
      const raw = selection?.toString().trim();
      if (!raw || raw.length < 2 || raw.length > 80) {
        onSelect(null);
        return;
      }
      const text = raw.normalize("NFC");
      const range = selection!.getRangeAt(0);
      const container = range.startContainer;
      const block = (
        container.nodeType === Node.TEXT_NODE ? container.parentElement : (container as Element)
      )?.closest("p, li, td, [data-selectable]");
      const sentenceContext = (block?.textContent ?? text).normalize("NFC");
      onSelect({ text, sentenceContext, rect: range.getBoundingClientRect() });
    }

    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onSelect(null);
    }

    el.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("keydown", handleKey);
    return () => {
      el.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("keydown", handleKey);
    };
  }, [containerRef, onSelect, ignoreRef]);
}
```

- [ ] **Step 2: Create generalised `src/components/word-lookup-popover.tsx`**

Self-contained: owns lookup state, calls `resolveLookup`, renders the card (reuse the existing `LookupCard`/`Section`/`Divider` JSX from the old file verbatim), adds a "↻ re-explain" link calling `reexplainInContext`. Save calls `saveVocabularyWord(lemma)` then `onSaved(lemma)`.

```tsx
"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { resolveLookup, reexplainInContext, saveVocabularyWord, type LookupSource } from "@/lib/actions/vocabulary";
import type { LookupResult } from "@/lib/ai/lookup";
import { useTextSelection } from "@/hooks/use-text-selection";
// ...reuse imports from the old popover (Chip, Button, CEFR classes, cn, icons)

type State =
  | { phase: "hidden" }
  | { phase: "loading"; word: string; x: number; y: number }
  | { phase: "ready"; lemma: string; word: string; result: LookupResult; x: number; y: number; sentence: string };

export function WordLookupPopover({
  containerRef,
  source,
  savedLemmas,
  onSaved,
}: {
  containerRef: React.RefObject<HTMLElement | null>;
  source: LookupSource;
  savedLemmas: string[];
  onSaved: (lemma: string) => void;
}) {
  const [state, setState] = useState<State>({ phase: "hidden" });
  const [, startTransition] = useTransition();
  const popoverRef = useRef<HTMLDivElement>(null);

  const onSelect = useCallback(
    (sel: { text: string; sentenceContext: string; rect: DOMRect } | null) => {
      if (!sel) return setState({ phase: "hidden" });
      const x = Math.min(sel.rect.left + sel.rect.width / 2, window.innerWidth - 320);
      const y = sel.rect.bottom + window.scrollY + 8;
      setState({ phase: "loading", word: sel.text, x, y });
      startTransition(async () => {
        try {
          const { lemma, result } = await resolveLookup(sel.text, sel.sentenceContext, source);
          setState((p) =>
            p.phase === "hidden"
              ? p
              : { phase: "ready", lemma, word: sel.text, result, x, y, sentence: sel.sentenceContext },
          );
        } catch {
          setState({ phase: "hidden" });
        }
      });
    },
    [source],
  );

  useTextSelection(containerRef, onSelect, popoverRef);

  // ...render: identical structure to the old popover's LoadingSkeleton / LookupCard,
  // but Save button calls: await saveVocabularyWord(state.lemma); onSaved(state.lemma);
  // isSaved = savedLemmas.includes(state.lemma);
  // add under Examples a button: "↻ Re-explain in this sentence" →
  //   const ic = await reexplainInContext(state.lemma, state.sentence);
  //   then show `ic` in place of result.in_context (local state).
  // ...
}
```

> Copy the `LoadingSkeleton`, `LookupCard`, `Section`, `Divider` helpers from the old file unchanged except: `LookupCard` takes `lemma`, computes `isSaved` from `savedLemmas`, and renders the re-explain button + the overridable in-context text.

- [ ] **Step 3: Rewire `reader-client.tsx`**

- Remove imports of `upsertVocabularyLookup`; import the new popover from `@/components/word-lookup-popover`.
- Replace the `<WordLookupPopover articleRef=... onLookup=... onSave=... savedWords=... />` block (lines ~167-173) with:

```tsx
<WordLookupPopover
  containerRef={articleRef}
  source={{ type: "reading", documentId: doc.id }}
  savedLemmas={savedWords}
  onSaved={(lemma) => setSavedWords((prev) => (prev.includes(lemma) ? prev : [...prev, lemma]))}
/>
```

- Delete `handleLookupWord` and `handleSaveWord` (now internal to the popover). `savedWords` state + `initialSavedWords` stay (used by `SessionSidebar`).

- [ ] **Step 4: Delete the old document-scoped popover**

```bash
git rm src/app/(main)/documents/[id]/_components/word-lookup-popover.tsx
```

- [ ] **Step 5: Lint + build**

```bash
npm run lint && npm run build
```
Expected: pass.

- [ ] **Step 6: Manual verify (reading still works)**

Start the dev server with `preview_start`, open a document, select a word.
- `preview_console_logs` / `preview_network`: a `resolveLookup` POST fires; popover shows translation.
- Select the same word again: popover appears with no new AI lookup network call (cache hit).
- Click Save: `preview_snapshot` shows the button flips to "Saved".

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(vocab): generalised selection popover + reading rewire"
```

---

## Task 4: TCF drill integration

Mount the popover on the drill, on question text + options.

**Files:**
- Modify: `src/app/tcf/_components/drill-runner.tsx`

**Interfaces:**
- Consumes: `<WordLookupPopover>`, `TcfQuestionForDrill` (must expose `id`).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Confirm `TcfQuestionForDrill` exposes `id`**

Open `src/lib/actions/tcf.ts`, find `getTcfDrillQuestions` / the `TcfQuestionForDrill` type. If the selected columns omit `id`, add `id: tcfQuestions.id` to the `.select({...})` and to the type. (Needed so occurrences can target a question.)

- [ ] **Step 2: Add a container ref + mount the popover in `drill-runner.tsx`**

- Add `import { useRef } from "react";` (extend existing react import) and `import { WordLookupPopover } from "@/components/word-lookup-popover";`.
- Add `const contentRef = useRef<HTMLDivElement>(null);` in the component.
- Put `ref={contentRef}` on the question card `<div className="rounded-xl border ...">` (line ~95).
- Mark the instruction `<p>` and each option text `<span>` as selectable context blocks by adding `data-selectable` to them (the instruction `<p>` at line ~97 and the option text `<span>{option}</span>` at line ~182).
- After the question card (before Prev/Next), mount:

```tsx
<WordLookupPopover
  containerRef={contentRef}
  source={{ type: "tcf", tcfQuestionId: q.id }}
  savedLemmas={[]}
  onSaved={() => {}}
/>
```

> `savedLemmas={[]}` is acceptable here — the drill does not show a saved-state badge; saving still persists. Per spec, occurrence links are library-only, so nothing else changes on the drill.

- [ ] **Step 3: Lint + build**

```bash
npm run lint && npm run build
```
Expected: pass.

- [ ] **Step 4: Manual verify**

`preview_start`, navigate to `/tcf/drill?skill=reading&level=A2` (reading has visible text to select).
- Select a word in the instruction and in an option (`showAnswer` on so option text is visible): popover appears for both.
- `preview_network`: first selection of a new word → AI; repeat → cache hit.

- [ ] **Step 5: Commit**

```bash
git add src/app/tcf/_components/drill-runner.tsx src/lib/actions/tcf.ts
git commit -m "feat(vocab): word lookup on TCF drill question + options"
```

---

## Task 5: Vocabulary library page

New top-level page: list, filters, detail with rich verb view + clickable source links.

**Files:**
- Create: `src/lib/vocab/display.ts` (level-gating helpers)
- Create: `src/app/(main)/vocabulary/page.tsx`
- Create: `src/app/(main)/vocabulary/_components/vocab-browser.tsx`
- Create: `src/app/(main)/vocabulary/_components/verb-tenses.tsx`
- Modify: `src/components/sidebar.tsx`
- Modify: `src/app/tcf/drill/page.tsx` (accept `?q=`)

**Interfaces:**
- Consumes: `getVocabEntries`, `getVocabEntryDetail`, `getCefrLevel`, `FrenchVocabEntry`, occurrence link data.
- Produces: nothing for later tasks.

- [ ] **Step 1: Create `src/lib/vocab/display.ts` (§6 level gate)**

```ts
import type { FrenchVocabEntry } from "@/lib/ai/enrich";

export const LEVEL_ORDER: Record<string, number> = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };

/** Tense keys visible at the learner's level, in canonical order, focus first-flagged. */
export function visibleTenses(
  entry: FrenchVocabEntry,
  learnerLevel: string,
): { key: string; focus: boolean }[] {
  if (!entry.verb) return [];
  const ceil = LEVEL_ORDER[learnerLevel] ?? 1;
  const focus = new Set(entry.verb.focus_tenses);
  return Object.entries(entry.verb.tenses)
    .filter(([, block]) => (LEVEL_ORDER[block.level] ?? 99) <= ceil)
    .sort((a, b) => (LEVEL_ORDER[a[1].level] ?? 99) - (LEVEL_ORDER[b[1].level] ?? 99))
    .map(([key]) => ({ key, focus: focus.has(key) }));
}
```

- [ ] **Step 2: Add the sidebar entry**

In `src/components/sidebar.tsx`, add to the nav items array (after the `/library` entry, ~line 28):

```ts
{ href: "/vocabulary", label: "Vocabulary" },
```

(Match the existing item shape — copy the neighbouring object's structure including any `icon` field used by siblings.)

- [ ] **Step 3: Create the page (server component)**

```tsx
// src/app/(main)/vocabulary/page.tsx
import { getVocabEntries } from "@/lib/actions/vocabulary";
import { getCefrLevel } from "@/lib/actions/settings";
import { VocabBrowser } from "./_components/vocab-browser";

export default async function VocabularyPage() {
  const [entries, level] = await Promise.all([getVocabEntries(), getCefrLevel()]);
  return (
    <div className="px-8 py-8 max-w-5xl mx-auto">
      <h1 className="font-serif text-3xl font-semibold tracking-tight mb-1">Vocabulary</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Every word you looked up while reading or practising TCF.
      </p>
      <VocabBrowser initialEntries={entries} learnerLevel={level ?? "A2"} />
    </div>
  );
}
```

- [ ] **Step 4: Create `vocab-browser.tsx` (client: filters + list + detail)**

Client component. Filters: text search, level, pos, saved-only. Clicking an entry calls `getVocabEntryDetail(lemma)` and shows a detail panel. Detail renders: header (word, pos, level, translation), flat in-context + examples, and — when `richEntry` present — `<VerbTenses>` + collocations + canada_note; when `saved && !enriched` show "Generating…". The "Appears in" block maps `occurrences` to links:

```tsx
function occurrenceHref(o: OccurrenceLink): string {
  if (o.sourceType === "reading" && o.documentId) return `/documents/${o.documentId}`;
  if (o.sourceType === "tcf" && o.tcfQuestionId) return `/tcf/drill?q=${o.tcfQuestionId}`;
  return "#";
}
```

> Build the list/detail with existing primitives (`Card`, `Chip`, `Button`, `CEFR_CHIP_CLASSES`, `cn`). Use `font-serif` for French words/examples, `font-sans` for chrome. Filters are local `useState`; entries already loaded — filter client-side. Detail fetched lazily via `useTransition` + `getVocabEntryDetail`.

- [ ] **Step 5: Create `verb-tenses.tsx`**

```tsx
"use client";

import type { FrenchVocabEntry } from "@/lib/ai/enrich";
import { visibleTenses } from "@/lib/vocab/display";
import { cn } from "@/lib/utils";

export function VerbTenses({ entry, learnerLevel }: { entry: FrenchVocabEntry; learnerLevel: string }) {
  if (!entry.verb) return null;
  const tenses = visibleTenses(entry, learnerLevel);
  return (
    <div className="space-y-3">
      {tenses.map(({ key, focus }) => {
        const block = entry.verb!.tenses[key];
        return (
          <div key={key} className="rounded-lg border border-border/60 px-4 py-3">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={cn("text-xs font-medium", focus ? "text-accent" : "text-muted-foreground")}>
                {focus ? "★ " : ""}{key}
              </span>
              <span className="text-[10px] text-subtle-foreground">{block.level}</span>
            </div>
            {block.type === "simple" && block.forms ? (
              <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 font-mono text-xs">
                {Object.entries(block.forms).map(([person, form]) => (
                  <span key={person}><span className="text-muted-foreground">{person}</span> {form}</span>
                ))}
              </div>
            ) : (
              <p className="font-mono text-xs text-foreground">{block.sample}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 6: `drill/page.tsx` — accept `?q=`**

Extend `searchParams` to include `q?: string`. After loading `questions`, compute the initial index and pass it:

```tsx
}: {
  searchParams: Promise<{ skill?: string; level?: string; q?: string }>;
}) {
  const { skill: skillParam, level: levelParam, q } = await searchParams;
  // ...existing skill/level resolution...
  const questions = await getTcfDrillQuestions(skill, level);
  const initialIndex = q ? Math.max(0, questions.findIndex((x) => x.id === q)) : 0;
  // ...
  <DrillRunner questions={questions} initialIndex={initialIndex} />
```

> The library's tcf link uses only `?q=<id>`; this resolves the correct index even without skill/level in the URL **as long as the question is in the default A2 set**. To make cross-level links robust, also include skill/level in `occurrenceHref` — extend Step 4 to fetch the question's skill/level. Minimal version (q only) is acceptable for first delivery; note the limitation in the commit body.

- [ ] **Step 7: Lint + build**

```bash
npm run lint && npm run build
```
Expected: pass.

- [ ] **Step 8: Manual verify**

`preview_start`:
- Visit `/vocabulary`: looked-up words listed; filters narrow the list (`preview_fill` the search, `preview_click` a level chip, `preview_snapshot`).
- Click a saved verb: rich tense tables appear, gated to the learner level; collocations/canada_note shown.
- "Appears in": `preview_click` a link → navigates to the right document or `/tcf/drill?q=…` opening at the correct question.
- Confirm occurrences appear **only** here, never in the drill/reading popover.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(vocab): vocabulary library page with rich verb view + source links"
```

---

## Self-Review

**Spec coverage:**
- §0 selection on reading + TCF question/option → Tasks 3, 4. ✅
- §2.1 cache-first via alias table → Task 1 (tables) + Task 2 (`resolveLookup`). ✅
- §2.2 links library-only → Task 4 (`savedLemmas=[]`, no occurrence read on drill) + Task 5 ("Appears in" only on page). ✅
- §3 data model (reshape + 2 tables, `NULLS NOT DISTINCT`) → Task 1. ✅
- §4 AI flow (Tier-1 lemma, resolveLookup, reexplain, enrich, save-triggers-enrich) → Tasks 1, 2. ✅
- §5 UI (generalised selection, re-explain button, /vocabulary, level-gated verb view, nav) → Tasks 3, 5. ✅
- §5.3 source-link nav (`?q=`, `/documents/[id]`) → Task 5. ✅
- §6 error handling (lookup fail → hidden + dict link reused; enrich fail → flat kept; conflict guards) → Tasks 2, 3. ✅
- §3.5 migration / clear legacy rows → Task 1 Step 5. ✅

**Placeholder scan:** No "TBD"/"handle edge cases" without code. The two prose-described UI helpers (popover card copy in Task 3 Step 2; vocab-browser layout in Task 5 Step 4) explicitly reuse named, existing components and give the exact data shapes and the only new logic (re-explain handler, `occurrenceHref`) as code. Acceptable — they assemble already-specified primitives.

**Type consistency:** `lemma` is the dedupe key everywhere; `LookupResult` gains `lemma` in Task 1 and is consumed with it in Task 2/3; `LookupSource`, `VocabEntrySummary`, `VocabEntryDetail`, `OccurrenceLink`, `FrenchVocabEntry` defined in Task 2 and consumed in Task 5; `enrichEntry`/`enrichVocab` names distinct and used consistently (`enrichEntry` = action, `enrichVocab` = AI call).

---

## Execution Handoff

(Filled in by the orchestrator after the user picks an execution mode.)
