# Grammar Reference Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A2–B1 grammar reference library (~68 points): curated outline in git → AI-drafted content in DB as `draft` → user verifies point-by-point while reading (`/grammar` list + `/grammar/[slug]` detail with inline edit + "Mark as verified").

**Architecture:** Spec: `docs/superpowers/specs/2026-07-10-grammar-reference-design.md`. New `grammar_points` table (uuid PK + timestamptz convention); outline file `src/lib/grammar-outline.ts` is the single authoritative source of the point list; generation script (mirrors `seed-rules.ts`) fills missing slugs via OpenAI structured outputs; pages follow the existing "async server component → `lib/actions` server actions → Drizzle" flow, no API routes.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle + postgres.js, Tailwind v4 semantic tokens, OpenAI structured outputs (`zodResponseFormat`), lucide-react.

## Global Constraints

- **No test suite exists (per CLAUDE.md).** Each task's verify step = `npx tsc --noEmit` + `npx eslint src` + targeted manual check via dev server at the end. Do not introduce a test framework.
- **This Next.js version has breaking changes (per AGENTS.md).** Before writing page code, consult `node_modules/next/dist/docs/01-app/` if unsure. Known ground truth from this repo: dynamic route `params` is a **Promise** (`const { slug } = await params`), server actions use `"use server"` + `revalidatePath`.
- All DB queries **async** Drizzle (`await db.select()...`); never `.run()/.get()/.all()`.
- New table: `uuid` PK `defaultRandom()`, `timestamp(..., { withTimezone: true })`.
- Colours only via semantic tokens; UI copy in `(main)` routes is English; French example sentences render in `font-serif`.
- UI primitives from `src/components/ui/` (`Button`, `Chip`, `Card`, `Input`); `cva`/`cn` conventions.
- Commit messages: plain conventional commits, **no `Co-Authored-By` / "Generated with" trailers** (explicit user preference in CLAUDE.md — overrides any harness default).
- Deliberately deferred (do NOT build): practice drills (B), B2 content, review-queue backoffice, `rules` table changes, error-card → grammar backlinks.

---

### Task 1: Branch + `grammar_points` schema + migration

**Files:**
- Modify: `src/lib/db/schema.ts` (append after the speaking tables / `userSettings` block)
- Generated: `drizzle/` migration via `npm run db:generate`

**Interfaces:**
- Produces: `grammarPoints` table export + `export type GrammarPoint = typeof grammarPoints.$inferSelect;`

- [ ] **Step 1:** `git switch -c grammar-reference`
- [ ] **Step 2:** Append to `src/lib/db/schema.ts`:

```ts
/* ------------------------------------------------------------------ */
/*  grammar_points — A2–B1 grammar reference library                   */
/*  Outline (slug/name/level/category/mapping) lives in                */
/*  src/lib/grammar-outline.ts; AI drafts content as status='draft',   */
/*  the user verifies while reading.                                   */
/* ------------------------------------------------------------------ */

export const grammarPoints = pgTable(
  "grammar_points",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Stable key from the outline; used for URLs and idempotent generation. */
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    level: text("level").notNull(), // 'A2' | 'B1'
    category: text("category").notNull(), // pedagogical group, see GRAMMAR_CATEGORIES
    orderIndex: integer("order_index").notNull(),
    summary: text("summary").notNull(),
    /** Markdown-lite: paragraphs, **bold**, *italic*, `code`, "- " bullets only. */
    descriptionEn: text("description_en").notNull(),
    examples: jsonb("examples").$type<{ fr: string; en: string }[]>().notNull(),
    /** ERROR_TAXONOMY leaf keys this point maps to (may be empty). */
    taxonomySubcategories: jsonb("taxonomy_subcategories").$type<string[]>().notNull(),
    status: text("status").notNull().default("draft"), // 'draft' | 'verified'
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("grammar_points_category_order_idx").on(t.category, t.orderIndex)],
);

export type GrammarPoint = typeof grammarPoints.$inferSelect;
```

- [ ] **Step 3:** `npm run db:generate` → new migration appears; `npm run db:init` → applies cleanly (idempotent runner).
- [ ] **Step 4:** Verify: `npx tsc --noEmit` clean; `npm run db:studio` (or a one-off `tsx` query) shows the empty table.
- [ ] **Step 5:** Commit `feat(grammar): grammar_points table` .

### Task 2: Curated outline `src/lib/grammar-outline.ts`

The outline is the deliverable the **user reviews** — 68 points, 8 categories, CEFR A2/B1 inventory-based. Copy it verbatim; it is not a sketch.

**Files:**
- Create: `src/lib/grammar-outline.ts`

**Interfaces:**
- Produces: `GRAMMAR_CATEGORIES` (ordered readonly array), `type GrammarCategory`, `type GrammarOutlineEntry`, `GRAMMAR_OUTLINE: GrammarOutlineEntry[]`
- `taxonomySubcategories` values must be leaf keys of `ERROR_TAXONOMY` (`src/lib/taxonomy.ts`)

- [ ] **Step 1:** Create the file:

```ts
/**
 * Authoritative outline of the grammar reference library (A2–B1).
 * The AI drafts content for each entry (scripts/generate-grammar-points.ts);
 * it never decides WHAT to cover — only this file does.
 *
 * taxonomySubcategories map each point to ERROR_TAXONOMY leaf keys so the
 * detail page can surface "your errors on this point". Empty = no mapping.
 */
import type { ErrorSubcategory } from "@/lib/taxonomy";

export const GRAMMAR_CATEGORIES = [
  "Nouns & Articles",
  "Adjectives & Agreement",
  "Pronouns",
  "Verb Tenses",
  "Moods",
  "Negation & Questions",
  "Prepositions",
  "Sentence Structure & Discourse",
] as const;

export type GrammarCategory = (typeof GRAMMAR_CATEGORIES)[number];

export type GrammarOutlineEntry = {
  slug: string;
  name: string;
  level: "A2" | "B1";
  category: GrammarCategory;
  orderIndex: number;
  taxonomySubcategories: ErrorSubcategory[];
};

const e = (
  category: GrammarCategory,
  orderIndex: number,
  slug: string,
  name: string,
  level: "A2" | "B1",
  taxonomySubcategories: ErrorSubcategory[] = [],
): GrammarOutlineEntry => ({ slug, name, level, category, orderIndex, taxonomySubcategories });

export const GRAMMAR_OUTLINE: GrammarOutlineEntry[] = [
  // ─── Nouns & Articles ────────────────────────────────────────────
  e("Nouns & Articles", 1, "noun-gender-patterns", "Noun gender and typical endings", "A2", ["noun_gender"]),
  e("Nouns & Articles", 2, "plural-of-nouns", "Plural of nouns (-s, -x, -aux)", "A2"),
  e("Nouns & Articles", 3, "definite-and-indefinite-articles", "Definite vs indefinite articles (le/la/les vs un/une/des)", "A2", ["definite_vs_indefinite", "article_noun_mismatch"]),
  e("Nouns & Articles", 4, "partitive-articles", "Partitive articles (du, de la, des)", "A2", ["partitive"]),
  e("Nouns & Articles", 5, "contracted-articles", "Contracted articles (au, aux, du, des)", "A2", ["contraction"]),
  e("Nouns & Articles", 6, "articles-in-negation", "Articles in negation (un/une/des → de)", "A2", ["negation_de_rule"]),
  e("Nouns & Articles", 7, "article-omission", "When to omit the article (professions, quantities, fixed expressions)", "B1", ["article_omission"]),

  // ─── Adjectives & Agreement ──────────────────────────────────────
  e("Adjectives & Agreement", 1, "adjective-agreement", "Adjective gender and number agreement", "A2", ["adjective_agreement"]),
  e("Adjectives & Agreement", 2, "adjective-position", "Adjective position (before / after the noun)", "A2", ["adjective_position"]),
  e("Adjectives & Agreement", 3, "possessive-adjectives", "Possessive adjectives (mon/ma/mes, son/sa/ses)", "A2", ["article_noun_mismatch"]),
  e("Adjectives & Agreement", 4, "demonstrative-adjectives", "Demonstrative adjectives (ce, cet, cette, ces)", "A2", ["article_noun_mismatch"]),
  e("Adjectives & Agreement", 5, "comparative-and-superlative", "Comparative and superlative (plus/moins/aussi… que, le plus…)", "A2"),
  e("Adjectives & Agreement", 6, "indefinite-adjectives", "Indefinite adjectives (chaque, quelques, plusieurs, tout)", "B1", ["adjective_agreement"]),

  // ─── Pronouns ────────────────────────────────────────────────────
  e("Pronouns", 1, "subject-pronouns-and-on", "Subject pronouns and 'on'", "A2", ["subject_pronoun"]),
  e("Pronouns", 2, "direct-object-pronouns", "Direct object pronouns (me, te, le, la, nous, vous, les)", "A2", ["object_pronoun"]),
  e("Pronouns", 3, "indirect-object-pronouns", "Indirect object pronouns (me, te, lui, nous, vous, leur)", "A2", ["object_pronoun"]),
  e("Pronouns", 4, "pronoun-y", "The pronoun y", "A2", ["y_en"]),
  e("Pronouns", 5, "pronoun-en", "The pronoun en", "A2", ["y_en"]),
  e("Pronouns", 6, "stressed-pronouns", "Stressed pronouns (moi, toi, lui, elle…)", "A2", ["stressed_pronoun"]),
  e("Pronouns", 7, "double-pronoun-order", "Order of double object pronouns", "B1", ["object_pronoun"]),
  e("Pronouns", 8, "relative-pronouns-qui-que-ou", "Relative pronouns qui, que, où", "B1"),
  e("Pronouns", 9, "relative-pronoun-dont-lequel", "Relative pronouns dont and lequel", "B1"),
  e("Pronouns", 10, "demonstrative-pronouns", "Demonstrative pronouns (celui, celle, ceux; ceci/cela/ça)", "B1"),
  e("Pronouns", 11, "possessive-pronouns", "Possessive pronouns (le mien, la tienne…)", "B1"),
  e("Pronouns", 12, "indefinite-pronouns", "Indefinite pronouns (quelqu'un, personne, rien, chacun)", "B1", ["negation_structure"]),

  // ─── Verb Tenses ─────────────────────────────────────────────────
  e("Verb Tenses", 1, "present-tense-regular", "Present tense: regular -er / -ir / -re verbs", "A2", ["conjugation_present"]),
  e("Verb Tenses", 2, "present-tense-irregular", "Present tense: key irregular verbs (être, avoir, aller, faire, venir…)", "A2", ["conjugation_present"]),
  e("Verb Tenses", 3, "pronominal-verbs", "Pronominal (reflexive) verbs", "A2", ["conjugation_present", "auxiliary_choice"]),
  e("Verb Tenses", 4, "passe-compose-with-avoir", "Passé composé with avoir", "A2", ["conjugation_passe_compose", "auxiliary_choice"]),
  e("Verb Tenses", 5, "passe-compose-with-etre", "Passé composé with être", "A2", ["conjugation_passe_compose", "auxiliary_choice", "past_participle_agreement"]),
  e("Verb Tenses", 6, "imparfait", "The imparfait", "A2", ["pc_vs_imparfait"]),
  e("Verb Tenses", 7, "passe-compose-vs-imparfait", "Passé composé vs imparfait", "B1", ["pc_vs_imparfait", "tense_choice"]),
  e("Verb Tenses", 8, "plus-que-parfait", "The plus-que-parfait", "B1", ["tense_choice"]),
  e("Verb Tenses", 9, "futur-proche", "Futur proche (aller + infinitive)", "A2", ["tense_choice"]),
  e("Verb Tenses", 10, "futur-simple", "Futur simple", "A2", ["tense_choice", "futur_vs_conditionnel"]),
  e("Verb Tenses", 11, "venir-de-recent-past", "Recent past (venir de + infinitive)", "A2", ["tense_choice"]),
  e("Verb Tenses", 12, "etre-en-train-de", "Ongoing action (être en train de + infinitive)", "A2"),
  e("Verb Tenses", 13, "past-participle-agreement-avoir", "Past participle agreement with avoir (preceding direct object)", "B1", ["past_participle_agreement"]),
  e("Verb Tenses", 14, "depuis-pendant-il-y-a", "Time markers with tenses (depuis, pendant, il y a)", "B1", ["time_preposition", "tense_choice"]),

  // ─── Moods ───────────────────────────────────────────────────────
  e("Moods", 1, "imperative", "The imperative", "A2"),
  e("Moods", 2, "conditionnel-present", "Conditionnel présent (politeness, wishes, suggestions)", "A2", ["futur_vs_conditionnel"]),
  e("Moods", 3, "si-clauses", "Hypotheses with si (si + présent / si + imparfait)", "B1", ["futur_vs_conditionnel", "tense_choice"]),
  e("Moods", 4, "subjunctive-formation", "Subjunctive: formation", "B1", ["subjonctif_basic"]),
  e("Moods", 5, "subjunctive-triggers", "Subjunctive: common triggers (il faut que, vouloir que, avant que…)", "B1", ["subjonctif_basic"]),
  e("Moods", 6, "subjunctive-vs-indicative", "Subjunctive vs indicative (penser que vs ne pas penser que…)", "B1", ["subjonctif_basic"]),
  e("Moods", 7, "gerund-en-participe-present", "Gérondif (en + -ant) and the present participle", "B1"),
  e("Moods", 8, "infinitive-constructions", "Infinitive constructions (verb + infinitive, avant de, pour…)", "B1", ["verb_preposition"]),

  // ─── Negation & Questions ────────────────────────────────────────
  e("Negation & Questions", 1, "basic-negation", "Basic negation (ne… pas)", "A2", ["negation_structure"]),
  e("Negation & Questions", 2, "negation-variants", "Negation variants (ne… plus / jamais / rien / personne)", "A2", ["negation_structure"]),
  e("Negation & Questions", 3, "negation-compound-tenses", "Negation in compound tenses and with pronouns", "B1", ["negation_structure"]),
  e("Negation & Questions", 4, "restriction-ne-que", "Restriction with ne… que", "B1", ["negation_structure"]),
  e("Negation & Questions", 5, "yes-no-questions", "Yes/no questions (intonation, est-ce que)", "A2", ["question_formation"]),
  e("Negation & Questions", 6, "information-questions", "Information questions (où, quand, comment, pourquoi, quel, lequel)", "A2", ["question_formation"]),
  e("Negation & Questions", 7, "inversion-questions", "Questions with inversion", "B1", ["question_formation"]),

  // ─── Prepositions ────────────────────────────────────────────────
  e("Prepositions", 1, "prepositions-of-place", "Prepositions of place (dans, sur, sous, devant, chez…)", "A2", ["place_preposition"]),
  e("Prepositions", 2, "prepositions-with-places", "Prepositions with cities and countries (à, en, au, aux)", "A2", ["place_preposition"]),
  e("Prepositions", 3, "prepositions-of-time", "Prepositions of time (à, en, dans, depuis, pendant, pour)", "A2", ["time_preposition"]),
  e("Prepositions", 4, "verbs-with-preposition-a", "Verbs followed by à (penser à, réussir à…)", "B1", ["verb_preposition"]),
  e("Prepositions", 5, "verbs-with-preposition-de", "Verbs followed by de (avoir besoin de, essayer de…)", "B1", ["verb_preposition"]),
  e("Prepositions", 6, "a-vs-de-before-infinitive", "à vs de before an infinitive", "B1", ["verb_preposition"]),

  // ─── Sentence Structure & Discourse ──────────────────────────────
  e("Sentence Structure & Discourse", 1, "word-order-basics", "Basic word order (SVO, pronoun placement)", "A2", ["word_order"]),
  e("Sentence Structure & Discourse", 2, "adverbs-formation-placement", "Adverbs: formation (-ment) and placement", "A2", ["word_order"]),
  e("Sentence Structure & Discourse", 3, "impersonal-expressions", "Impersonal expressions (il faut, il y a, il fait…)", "A2"),
  e("Sentence Structure & Discourse", 4, "connectors-time-sequence", "Time and sequence connectors (d'abord, ensuite, puis, enfin…)", "B1"),
  e("Sentence Structure & Discourse", 5, "connectors-cause-consequence", "Cause and consequence connectors (parce que, comme, donc, alors…)", "B1"),
  e("Sentence Structure & Discourse", 6, "indirect-speech", "Indirect speech (dire que, demander si…)", "B1", ["tense_choice"]),
  e("Sentence Structure & Discourse", 7, "emphasis-cest-qui-que", "Emphasis with c'est… qui / c'est… que", "B1", ["awkward_structure"]),
  e("Sentence Structure & Discourse", 8, "passive-voice-intro", "The passive voice (introduction)", "B1"),
];
```

- [ ] **Step 2:** Guard against typos — slugs unique, orderIndex contiguous per category. One-off check:

Run: `npx tsx -e "import('./src/lib/grammar-outline').then(m=>{const s=new Set(m.GRAMMAR_OUTLINE.map(x=>x.slug));console.log(m.GRAMMAR_OUTLINE.length,'entries,',s.size,'unique slugs')})"`
Expected: `68 entries, 68 unique slugs` (taxonomy keys are already compile-checked via the `ErrorSubcategory` type).

- [ ] **Step 3:** `npx tsc --noEmit` clean (this is what validates every taxonomy key).
- [ ] **Step 4:** Commit `feat(grammar): curated A2–B1 outline (68 points, taxonomy-mapped)`.

### Task 3: AI drafting module + generation script

**Files:**
- Modify: `src/lib/ai/client.ts` — add to `MODELS`: `grammar: process.env.OPENAI_MODEL_GRAMMAR ?? "gpt-4o",`
- Create: `src/lib/ai/grammar-draft.ts`
- Create: `scripts/generate-grammar-points.ts`
- Modify: `package.json` — add script `"grammar:generate": "tsx scripts/generate-grammar-points.ts"`

**Interfaces:**
- Consumes: `GRAMMAR_OUTLINE`, `GrammarOutlineEntry` (Task 2); `grammarPoints` (Task 1)
- Produces: `draftGrammarPoint(entry: GrammarOutlineEntry): Promise<GrammarDraft>` where `GrammarDraft = { summary: string; descriptionEn: string; examples: { fr: string; en: string }[] }`

- [ ] **Step 1:** Create `src/lib/ai/grammar-draft.ts` (mirrors `enrich.ts` conventions — plain server module, NOT `"use server"`):

```ts
// Plain server module (not a "use server" Server Action file): called from
// scripts/generate-grammar-points.ts only.

import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { openai, MODELS } from "./client";
import type { GrammarOutlineEntry } from "@/lib/grammar-outline";

const GrammarDraftSchema = z.object({
  /** One sentence, ≤ 25 words, no markdown. */
  summary: z.string(),
  /** Markdown-lite body (see prompt constraints). */
  description_en: z.string(),
  examples: z.array(z.object({ fr: z.string(), en: z.string() })),
});

export type GrammarDraft = {
  summary: string;
  descriptionEn: string;
  examples: { fr: string; en: string }[];
};

const SYSTEM_PROMPT = `You are an experienced FLE (français langue étrangère) teacher writing a grammar reference for an English-speaking learner at A2–B1 level.

For the given grammar point, write:
1. "summary" — one plain sentence (≤ 25 words) saying what the point covers. No markdown.
2. "description_en" — the explanation body, 150–350 words. Structure: what the rule is → how to form/use it → common pitfalls for learners (especially anglophone interference). Formatting is STRICTLY limited to: plain paragraphs separated by blank lines, **bold** for French forms and key terms, *italic* for emphasis, and bullet lines starting with "- ". NO headings, NO tables, NO numbered lists, NO links, NO inline code.
3. "examples" — 4 to 8 French sentences with natural English translations. Cover the main uses AND at least one contrast or negative/edge case. Keep vocabulary at A2–B1.

Accuracy over completeness: state rules the standard references agree on; for genuinely contested details, say "usually" rather than inventing a hard rule.`;

export async function draftGrammarPoint(entry: GrammarOutlineEntry): Promise<GrammarDraft> {
  const completion = await openai.chat.completions.parse({
    model: MODELS.grammar,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Grammar point: ${entry.name}\nCEFR level: ${entry.level}\nCategory: ${entry.category}`,
      },
    ],
    response_format: zodResponseFormat(GrammarDraftSchema, "grammar_draft"),
  });

  const parsed = completion.choices[0]?.message.parsed;
  if (!parsed) throw new Error(`No parsed draft for ${entry.slug}`);
  return {
    summary: parsed.summary,
    descriptionEn: parsed.description_en,
    examples: parsed.examples,
  };
}
```

- [ ] **Step 2:** Create `scripts/generate-grammar-points.ts` (mirrors `seed-rules.ts` env/client setup):

```ts
/**
 * Draft grammar reference content for every outline entry not yet in the DB.
 * Idempotent — skips slugs that already exist, so it is safe to re-run after
 * partial failures. Inserted rows have status='draft' (verify in-app).
 *
 *   npm run grammar:generate            # all missing points
 *   npm run grammar:generate -- --limit 3   # trial run
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { inArray } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";
import { grammarPoints } from "../src/lib/db/schema";
import { GRAMMAR_OUTLINE } from "../src/lib/grammar-outline";
import { draftGrammarPoint } from "../src/lib/ai/grammar-draft";

async function main() {
  const limitArg = process.argv.indexOf("--limit");
  const limit = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;

  const client = postgres(process.env.DATABASE_URL!, { max: 1 });
  const db = drizzle(client, { schema });

  const existing = await db
    .select({ slug: grammarPoints.slug })
    .from(grammarPoints)
    .where(inArray(grammarPoints.slug, GRAMMAR_OUTLINE.map((o) => o.slug)));
  const existingSlugs = new Set(existing.map((r) => r.slug));

  const missing = GRAMMAR_OUTLINE.filter((o) => !existingSlugs.has(o.slug)).slice(0, limit === Infinity ? undefined : limit);
  console.log(`${GRAMMAR_OUTLINE.length} outline entries — ${existingSlugs.size} in DB, drafting ${missing.length}.`);

  let ok = 0;
  let failed = 0;
  for (const entry of missing) {
    try {
      const draft = await draftGrammarPoint(entry);
      await db.insert(grammarPoints).values({
        slug: entry.slug,
        name: entry.name,
        level: entry.level,
        category: entry.category,
        orderIndex: entry.orderIndex,
        summary: draft.summary,
        descriptionEn: draft.descriptionEn,
        examples: draft.examples,
        taxonomySubcategories: entry.taxonomySubcategories,
        status: "draft",
      });
      ok += 1;
      console.log(`  ✓ ${entry.slug}`);
    } catch (err) {
      failed += 1;
      console.error(`  ✗ ${entry.slug}: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`✓ Done — drafted ${ok}, failed ${failed} (re-run to retry failures).`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 3:** Add `MODELS.grammar` to `src/lib/ai/client.ts` and the `grammar:generate` script to `package.json` as listed above.
- [ ] **Step 4:** `npx tsc --noEmit` clean.
- [ ] **Step 5:** Trial run: `npm run grammar:generate -- --limit 3` → `✓` for 3 slugs; re-run the same command → `drafting 3` again but for the NEXT 3 missing (first 3 skipped as existing). Spot-check one row in `npm run db:studio`: summary/description/examples populated, `status = 'draft'`.
- [ ] **Step 6:** Commit `feat(grammar): AI drafting pipeline (grammar:generate, idempotent)`.

### Task 4: Server actions `src/lib/actions/grammar.ts`

**Files:**
- Create: `src/lib/actions/grammar.ts`

**Interfaces:**
- Consumes: `grammarPoints`, `GrammarPoint`, `errors` from schema; `GRAMMAR_CATEGORIES`
- Produces (used by Tasks 6–7):
  - `listGrammarPoints(): Promise<{ points: GrammarPoint[]; verified: number; total: number }>`
  - `getGrammarPointBySlug(slug: string): Promise<GrammarPoint | null>`
  - `getErrorsForSubcategories(subs: string[]): Promise<{ total: number; recent: RecentGrammarError[] }>` with `RecentGrammarError = { id: string; original: string; correction: string; explanationEn: string; createdAt: Date }`
  - `updateGrammarPoint(id: string, data: { summary: string; descriptionEn: string; examples: { fr: string; en: string }[] }): Promise<void>`
  - `verifyGrammarPoint(id: string): Promise<void>`

- [ ] **Step 1:** Create the file:

```ts
"use server";

import { asc, count, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { errors, grammarPoints, type GrammarPoint } from "@/lib/db/schema";

export async function listGrammarPoints(): Promise<{
  points: GrammarPoint[];
  verified: number;
  total: number;
}> {
  const points = await db
    .select()
    .from(grammarPoints)
    .orderBy(asc(grammarPoints.category), asc(grammarPoints.orderIndex));
  const verified = points.filter((p) => p.status === "verified").length;
  return { points, verified, total: points.length };
}

export async function getGrammarPointBySlug(slug: string): Promise<GrammarPoint | null> {
  const row = await db
    .select()
    .from(grammarPoints)
    .where(eq(grammarPoints.slug, slug))
    .limit(1)
    .then((r) => r[0] ?? null);
  return row;
}

export type RecentGrammarError = {
  id: string;
  original: string;
  correction: string;
  explanationEn: string;
  createdAt: Date;
};

export async function getErrorsForSubcategories(
  subs: string[],
): Promise<{ total: number; recent: RecentGrammarError[] }> {
  if (subs.length === 0) return { total: 0, recent: [] };

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(errors)
    .where(inArray(errors.subcategory, subs));

  const recent = await db
    .select({
      id: errors.id,
      original: errors.original,
      correction: errors.correction,
      explanationEn: errors.explanationEn,
      createdAt: errors.createdAt,
    })
    .from(errors)
    .where(inArray(errors.subcategory, subs))
    .orderBy(desc(errors.createdAt))
    .limit(5);

  return { total, recent };
}

export async function updateGrammarPoint(
  id: string,
  data: { summary: string; descriptionEn: string; examples: { fr: string; en: string }[] },
): Promise<void> {
  const [row] = await db
    .update(grammarPoints)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(grammarPoints.id, id))
    .returning({ slug: grammarPoints.slug });
  if (row) {
    revalidatePath("/grammar");
    revalidatePath(`/grammar/${row.slug}`);
  }
}

export async function verifyGrammarPoint(id: string): Promise<void> {
  const [row] = await db
    .update(grammarPoints)
    .set({ status: "verified", verifiedAt: new Date(), updatedAt: new Date() })
    .where(eq(grammarPoints.id, id))
    .returning({ slug: grammarPoints.slug });
  if (row) {
    revalidatePath("/grammar");
    revalidatePath(`/grammar/${row.slug}`);
  }
}
```

- [ ] **Step 2:** `npx tsc --noEmit` + `npx eslint src/lib/actions/grammar.ts` clean.
- [ ] **Step 3:** Commit `feat(grammar): server actions (list, get, errors-for-point, update, verify)`.

### Task 5: `MarkdownLite` renderer

No markdown dependency exists in this project and we don't add one — the AI prompt (Task 3) restricts output to paragraphs / bold / italic / "- " bullets, so a ~60-line renderer covers it deterministically.

**Files:**
- Create: `src/components/markdown-lite.tsx`

**Interfaces:**
- Produces: `<MarkdownLite text={string} />` — pure component, safe in server AND client components (no hooks, no dangerouslySetInnerHTML).

- [ ] **Step 1:** Create the file:

```tsx
import React from "react";

/**
 * Renders the markdown-lite dialect used by grammar_points.description_en:
 * paragraphs (blank-line separated), "- " bullet lists, **bold**, *italic*.
 * Everything else renders as literal text — by design (no HTML injection).
 */

function renderInline(text: string): React.ReactNode[] {
  // Split on **bold** first, then *italic* inside the remainder.
  const nodes: React.ReactNode[] = [];
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  parts.forEach((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      nodes.push(<strong key={i}>{part.slice(2, -2)}</strong>);
    } else if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      nodes.push(<em key={i}>{part.slice(1, -1)}</em>);
    } else if (part) {
      nodes.push(part);
    }
  });
  return nodes;
}

export function MarkdownLite({ text }: { text: string }) {
  const blocks = text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  return (
    <div className="space-y-3">
      {blocks.map((block, i) => {
        const lines = block.split("\n").map((l) => l.trim());
        const isList = lines.every((l) => l.startsWith("- "));
        if (isList) {
          return (
            <ul key={i} className="list-disc pl-5 space-y-1">
              {lines.map((l, j) => (
                <li key={j}>{renderInline(l.slice(2))}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{renderInline(lines.join(" "))}</p>;
      })}
    </div>
  );
}
```

- [ ] **Step 2:** `npx tsc --noEmit` + `npx eslint src/components/markdown-lite.tsx` clean.
- [ ] **Step 3:** Commit `feat(grammar): MarkdownLite renderer for the constrained draft dialect`.

### Task 6: `/grammar` list page + sidebar entry

**Files:**
- Create: `src/app/(main)/grammar/page.tsx`
- Create: `src/app/(main)/grammar/_components/grammar-browser.tsx`
- Modify: `src/components/sidebar.tsx` — insert nav item after Vocabulary

**Interfaces:**
- Consumes: `listGrammarPoints` (Task 4), `GRAMMAR_CATEGORIES` (Task 2), `Chip`, `Input`

- [ ] **Step 1:** `page.tsx` (follows the Vocabulary page pattern):

```tsx
import { listGrammarPoints } from "@/lib/actions/grammar";
import { GrammarBrowser } from "./_components/grammar-browser";

export const dynamic = "force-dynamic";

export default async function GrammarPage() {
  const { points, verified, total } = await listGrammarPoints();
  return (
    <div className="px-8 py-8 max-w-5xl mx-auto">
      <h1 className="font-serif text-3xl font-semibold tracking-tight mb-1">Grammar</h1>
      <p className="text-sm text-muted-foreground mb-6">
        A2–B1 reference library. Drafted by AI — verify each point as you study it.
        {total > 0 && ` ${verified}/${total} verified.`}
      </p>
      <GrammarBrowser points={points} />
    </div>
  );
}
```

- [ ] **Step 2:** `_components/grammar-browser.tsx` (client — search + category grouping):

```tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { GrammarPoint } from "@/lib/db/schema";
import { GRAMMAR_CATEGORIES } from "@/lib/grammar-outline";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";

export function GrammarBrowser({ points }: { points: GrammarPoint[] }) {
  const [query, setQuery] = useState("");

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? points.filter((p) => `${p.name} ${p.summary}`.toLowerCase().includes(q))
      : points;
    return GRAMMAR_CATEGORIES.map((cat) => ({
      category: cat,
      items: filtered.filter((p) => p.category === cat),
    })).filter((g) => g.items.length > 0);
  }, [points, query]);

  return (
    <div className="space-y-8">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search grammar points…"
        className="max-w-sm"
      />
      {grouped.map(({ category, items }) => (
        <section key={category}>
          <h2 className="font-serif text-lg font-semibold mb-3">{category}</h2>
          <ul className="divide-y divide-border/60 rounded-2xl border border-border/70 bg-surface">
            {items.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/grammar/${p.slug}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-surface-muted transition-colors"
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium truncate">{p.name}</span>
                    <span className="block text-xs text-muted-foreground truncate">{p.summary}</span>
                  </span>
                  <Chip variant={p.level === "A2" ? "success" : "accent"}>{p.level}</Chip>
                  {p.status === "draft" && <Chip variant="warning">Draft</Chip>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {grouped.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {points.length === 0
            ? "No grammar points yet — run `npm run grammar:generate` to draft the library."
            : "No points match your search."}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 3:** Sidebar: in `src/components/sidebar.tsx`, add `SpellCheck` to the lucide import and insert after the Vocabulary item:

```ts
  {
    href: "/grammar",
    label: "Grammar",
    icon: SpellCheck,
    matcher: (p) => p.startsWith("/grammar"),
  },
```

- [ ] **Step 4:** Verify: `npx tsc --noEmit` + `npx eslint src` clean; dev server → `/grammar` renders groups from the trial rows (Task 3), search filters, Draft chips show, sidebar highlights.
- [ ] **Step 5:** Commit `feat(grammar): /grammar list page + sidebar entry`.

### Task 7: `/grammar/[slug]` detail page (read, edit, verify, linked errors)

**Files:**
- Create: `src/app/(main)/grammar/[slug]/page.tsx`
- Create: `src/app/(main)/grammar/[slug]/_components/point-editor.tsx`

**Interfaces:**
- Consumes: `getGrammarPointBySlug`, `getErrorsForSubcategories`, `updateGrammarPoint`, `verifyGrammarPoint` (Task 4); `MarkdownLite` (Task 5); `Button`, `Chip`, `Card`, `Input`

- [ ] **Step 1:** `page.tsx` — server component; `params` is a Promise (Next 16); linked-errors block server-rendered below the editor:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { getErrorsForSubcategories, getGrammarPointBySlug } from "@/lib/actions/grammar";
import { PointEditor } from "./_components/point-editor";

export const dynamic = "force-dynamic";

export default async function GrammarPointPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const point = await getGrammarPointBySlug(slug);
  if (!point) notFound();

  const linked = await getErrorsForSubcategories(point.taxonomySubcategories);

  return (
    <div className="px-8 py-8 max-w-3xl mx-auto space-y-8">
      <div>
        <Link href="/grammar" className="text-xs text-muted-foreground hover:text-foreground">
          ← Grammar
        </Link>
      </div>

      <PointEditor point={point} />

      {point.taxonomySubcategories.length > 0 && (
        <section>
          <h2 className="font-serif text-lg font-semibold mb-3">Your errors on this point</h2>
          {linked.total === 0 ? (
            <p className="text-sm text-muted-foreground">
              No errors recorded on this point yet. Keep it up!
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {linked.total} error{linked.total === 1 ? "" : "s"} recorded — most recent:
              </p>
              <ul className="space-y-2">
                {linked.recent.map((err) => (
                  <li key={err.id} className="rounded-xl border border-border/70 bg-surface px-4 py-3 text-sm">
                    <span className="font-serif line-through text-danger">{err.original}</span>
                    {" → "}
                    <span className="font-serif text-success">{err.correction}</span>
                    <p className="mt-1 text-xs text-muted-foreground">{err.explanationEn}</p>
                  </li>
                ))}
              </ul>
              <Link href="/progress" className="text-xs text-accent hover:underline">
                View all in Progress →
              </Link>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 2:** `_components/point-editor.tsx` (client — view/edit toggle + verify):

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { GrammarPoint } from "@/lib/db/schema";
import { updateGrammarPoint, verifyGrammarPoint } from "@/lib/actions/grammar";
import { MarkdownLite } from "@/components/markdown-lite";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input, Textarea } from "@/components/ui/input";

type Example = { fr: string; en: string };

export function PointEditor({ point }: { point: GrammarPoint }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [summary, setSummary] = useState(point.summary);
  const [description, setDescription] = useState(point.descriptionEn);
  const [examples, setExamples] = useState<Example[]>(point.examples);

  const startEdit = () => {
    setSummary(point.summary);
    setDescription(point.descriptionEn);
    setExamples(point.examples);
    setEditing(true);
  };

  const save = () =>
    startTransition(async () => {
      await updateGrammarPoint(point.id, {
        summary,
        descriptionEn: description,
        examples: examples.filter((ex) => ex.fr.trim()),
      });
      setEditing(false);
      router.refresh();
    });

  const verify = () =>
    startTransition(async () => {
      await verifyGrammarPoint(point.id);
      router.refresh();
    });

  const setExample = (i: number, patch: Partial<Example>) =>
    setExamples((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <Chip variant={point.level === "A2" ? "success" : "accent"}>{point.level}</Chip>
          {point.status === "verified" ? (
            <Chip variant="success">Verified</Chip>
          ) : (
            <Chip variant="warning">AI draft — not yet verified</Chip>
          )}
        </div>
        <h1 className="font-serif text-3xl font-semibold tracking-tight">{point.name}</h1>
        {!editing && <p className="text-sm text-muted-foreground">{point.summary}</p>}
      </header>

      {!editing ? (
        <>
          <div className="text-[15px] leading-relaxed">
            <MarkdownLite text={point.descriptionEn} />
          </div>
          <section>
            <h2 className="font-serif text-lg font-semibold mb-3">Examples</h2>
            <ul className="space-y-2">
              {point.examples.map((ex, i) => (
                <li key={i} className="rounded-xl border border-border/70 bg-surface px-4 py-3">
                  <p className="font-serif text-[15px]">{ex.fr}</p>
                  <p className="text-sm text-muted-foreground">{ex.en}</p>
                </li>
              ))}
            </ul>
          </section>
          <div className="flex gap-2">
            <Button variant="outline" onClick={startEdit} disabled={isPending}>
              Edit
            </Button>
            {point.status !== "verified" && (
              <Button onClick={verify} disabled={isPending}>
                Mark as verified
              </Button>
            )}
          </div>
        </>
      ) : (
        <div className="space-y-4">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Summary</span>
            <Input value={summary} onChange={(e) => setSummary(e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              Description (paragraphs, **bold**, *italic*, &quot;- &quot; bullets)
            </span>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={14}
              className="font-mono text-sm leading-relaxed"
            />
          </label>
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground">Examples</span>
            {examples.map((ex, i) => (
              <div key={i} className="flex gap-2 items-start">
                <div className="flex-1 space-y-1">
                  <Input
                    value={ex.fr}
                    onChange={(e) => setExample(i, { fr: e.target.value })}
                    placeholder="French sentence"
                    className="font-serif"
                  />
                  <Input
                    value={ex.en}
                    onChange={(e) => setExample(i, { en: e.target.value })}
                    placeholder="English translation"
                  />
                </div>
                <Button
                  variant="ghost"
                  onClick={() => setExamples((xs) => xs.filter((_, j) => j !== i))}
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              onClick={() => setExamples((xs) => [...xs, { fr: "", en: "" }])}
            >
              Add example
            </Button>
          </div>
          <div className="flex gap-2">
            <Button onClick={save} disabled={isPending}>
              {isPending ? "Saving…" : "Save"}
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)} disabled={isPending}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

(Verified against `src/components/ui/button.tsx`: `outline` and `ghost` variants exist; `Textarea` is exported from `src/components/ui/input.tsx`.)

- [ ] **Step 3:** Verify: `npx tsc --noEmit` + `npx eslint src` clean. Dev server walk-through on a trial row: open detail → body + examples render; Edit → change a word → Save → view mode shows the change; Mark as verified → chip flips, list page Draft chip gone; a point whose `taxonomySubcategories` overlap existing errors shows the errors block (pick `passe-compose-vs-imparfait` — `pc_vs_imparfait` almost certainly has rows); a point with no mapping (e.g. `plural-of-nouns`) hides the block; unknown slug → 404.
- [ ] **Step 4:** Commit `feat(grammar): detail page with inline edit, verify, linked errors`.

### Task 8: Full generation run + end-to-end pass + docs

**Files:**
- Modify: `CLAUDE.md` — Commands block: add `npm run grammar:generate  # AI-draft grammar reference content for missing outline entries`; Environment variables block: add `OPENAI_MODEL_GRAMMAR   # grammar drafts; defaults to gpt-4o`; Database section: table count 23→24, add `grammar_points` to the group list (its own bullet: "Grammar reference: `grammar_points` (outline in `src/lib/grammar-outline.ts`)"); update the "Current status" sentence to mention the grammar reference module.

- [ ] **Step 1:** `npm run grammar:generate` (full run, ~65 remaining points, several minutes). Expected: `✓ Done — drafted N, failed 0`; if failures, re-run until 0.
- [ ] **Step 2:** Sanity queries: total rows = 68; no empty descriptions:

Run: `npx tsx -e "import('dotenv').then(d=>{d.config({path:'.env.local'});d.config();import('postgres').then(async({default:pg})=>{const s=pg(process.env.DATABASE_URL);const r=await s\`select count(*)::int as n, count(*) filter (where length(description_en)<50)::int as thin from grammar_points\`;console.log(r[0]);await s.end()})})"`
Expected: `{ n: 68, thin: 0 }`

- [ ] **Step 3:** Browser pass: `/grammar` shows 8 groups / 68 points / "0/68 verified" (or trial-verified count); read 2–3 points end-to-end (markdown blocks, bold, bullets, examples); verify one → progress counter increments.
- [ ] **Step 4:** Update `CLAUDE.md` per above.
- [ ] **Step 5:** Final gates: `npx tsc --noEmit`, `npx eslint src`, `npm run build` — all clean.
- [ ] **Step 6:** Commit `feat(grammar): full library generation + docs`. Merge decision via superpowers:finishing-a-development-branch.

---

## Self-review notes

- **Spec coverage:** §3.1 table → Task 1; §3.2 outline → Task 2; §4 pipeline (idempotent, `--limit`, model env var) → Task 3; §5.1 list (grouping, chips, progress, search) → Task 6; §5.2 detail (markdown body, serif examples, errors block, edit, verify) → Tasks 5+7; §5.3 actions → Task 4; §6 boundaries respected (no `rules` change, no API route); §7 verification path → Tasks 3/7/8 verify steps; §8 exclusions in Global Constraints.
- **Spec deviation (deliberate):** outline lands at 68 points (spec said "约 60–80") and Markdown is the constrained markdown-lite dialect rendered by a purpose-built component (spec said "Markdown" — full markdown would need a new dependency; the AI prompt enforces the dialect, and the editor labels it).
- **Type consistency:** `examples`/`taxonomySubcategories` are `notNull` jsonb in schema and typed non-optional in `GrammarPoint`; script always inserts both; actions/components consume them without null-guards — consistent. `RecentGrammarError.createdAt` is `Date` (naive timestamp column on the legacy `errors` table — fine).
