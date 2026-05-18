# Sprint 7 — Learner Profile → Targeted Task Generation

> **Goal**: Close the core loop. The errors archive (S4–S6) starts to *feed back* into task generation (S3), so every new writing task is shaped by the learner's real weaknesses — not just the document they happened to open. This is the Sprint that turns Lumière from "AI tutor with memory" into "AI tutor that *uses* its memory".

---

## 1. PRD requirements (§13.2 Sprint 7)

Three deliverables, in order of dependency:

1. **Learner Profile data structure** — a derived view aggregated from the `errors` table (no new persisted state). It summarises the user's weak grammar points, mastered vocab, current CEFR estimate, and recurring patterns.
2. **Profile injection into task generation** — `generateTask` (and its server-action wrapper `generateWritingTask`) must receive the profile and use it to bias `target_grammar` selection toward the user's weakest subcategories.
3. **"Practice" button → targeted task** — the placeholder link in `top-patterns.tsx` (currently `TODO S7: wire to generate a targeted writing task`) becomes a real entry point. It generates a writing task whose `target_grammar` is **pinned** to the recurring pattern's subcategory.

This is also the moment to honour PRD §7.3.3's third writing-task source: **based on error archive**. The Reader-based sources (whole document / collected vocab) already exist; this Sprint adds the third.

---

## 2. Non-goals (out of scope for S7)

Keep the diff small. Defer the following:

- ❌ No new persisted `learner_profile` table. The profile is **derived on demand** from `errors` + `submissions` + `user_settings`. (Persisting it would create a sync problem with no upside — the aggregation is cheap and stays correct by construction.)
- ❌ No changes to the feedback pipeline (S4) or progress dashboard layout (S6).
- ❌ No SRS / spaced-repetition scheduling. v2 candidate.
- ❌ No "mastered words" UI surface. The profile *contains* a `masteredVocab` slice (used by the prompt to avoid recycling already-known words), but we don't render it yet.
- ❌ No A/B comparison of "with-profile vs without-profile" task quality. Tracked subjectively only.

---

## 3. Architecture sketch

```
Progress page  ┐
               ├── (Practice button click)
TopPatterns ───┘            │
                            ▼
                  practiceFromPattern(subcategory, category)   ← new server action
                            │
                            ├── buildLearnerProfile()           ← new pure aggregator
                            │     reads: errors, submissions, userSettings
                            │     returns: LearnerProfile
                            │
                            └── generateWritingTask(..., {
                                  pinnedGrammar: [subcategory],
                                  source: "archive",
                                  profile,
                                })
                                    │
                                    └── generateTask(...) ← prompt now includes profile context
                                        │
                                        ▼
                                   writing_tasks row (no document, no vocab)
                                        │
                                        ▼
                                   redirect /practice?taskId=…
```

No schema changes. No new tables. One new aggregator, one new server action, one new prompt parameter set, plus UI wiring.

---

## 4. Step-by-step plan

### Step 1 — Define the `LearnerProfile` shape

**File**: `src/lib/learner-profile.ts` (new — pure types + aggregator, no `"use server"`)

```ts
export type LearnerProfile = {
  cefrLevel: CefrLevel;              // from user_settings, default "B1"
  totalSubmissions: number;
  totalErrors: number;

  /** Top weak subcategories by raw count (descending). Capped to top 8. */
  weakGrammar: Array<{
    category: ErrorCategory;
    subcategory: string;
    count: number;
    /** Error rate trend over last 60 days: "improving" | "stable" | "worsening" */
    trend: "improving" | "stable" | "worsening";
  }>;

  /** Words the learner has used correctly in submissions (lowercased, NFC). Capped to 200 most recent. */
  masteredVocab: string[];

  /** Subcategories the learner has NOT erred on in the last 90 days — candidates for harder targets. */
  strongGrammar: string[];

  /** Truthy when there's enough signal to influence prompts. Below threshold → profile is ignored. */
  hasEnoughSignal: boolean;
};
```

**Why a derived view, not a table?** The errors table is already the source of truth (S4 §9.3: "errors is an event stream"). Persisting an aggregate would just duplicate state. The aggregation is a handful of `groupBy` queries — cheap, and always correct.

**Threshold for `hasEnoughSignal`**: ≥ 3 submissions AND ≥ 5 errors. Below that, the profile is too noisy to bias prompts; we fall back to the old behaviour (level-only).

### Step 2 — Implement `buildLearnerProfile()`

**File**: `src/lib/actions/learner-profile.ts` (new)

```ts
"use server";
export async function buildLearnerProfile(): Promise<LearnerProfile> { ... }
```

Queries (all parallelised via `Promise.all`, same pattern as `getDashboardStats`):

1. **CEFR level**: `select value from user_settings where key = 'cefr_level'` — default `"B1"` if missing.
2. **Totals**: `count()` on `submissions` and `errors`.
3. **Weak grammar**: `groupBy(errors.category, errors.subcategory).orderBy(desc(count())).limit(8)` — already exists as `getTopRecurringPatterns(8)` pattern; reuse the query shape but return raw counts.
4. **Trend per weak subcategory**: split errors into last-30d vs prior-30d buckets (mirrors `getDashboardStats` mostImproved logic). Classify:
   - `improving` if recent count ≤ ½ prior count
   - `worsening` if recent count ≥ 2 × prior count
   - `stable` otherwise
5. **Mastered vocab**: tokenise `submissions.contentFr` for the last 50 submissions, filter to tokens that **never** appear inside an `errors.original` span for that submission. Lowercase + NFC. Dedup. Cap 200.
   - *Implementation detail*: do this in JS after fetching, not SQL — keeps the query simple. Use a regex `/\p{L}+/gu` for word splitting.
6. **Strong grammar**: all subcategory ids from `ERROR_TAXONOMY` minus the ones present in errors from the last 90 days.

Follow the existing style in `src/lib/actions/errors.ts`:
- top-of-file `Helpers` section if needed
- typed return value declared in the function signature
- `db.select()...` async/await throughout — no `.run()/.get()/.all()` (PostgreSQL via node-postgres, per CLAUDE.md)
- region banners (`/* ----- buildLearnerProfile ----- */`) matching the convention

### Step 3 — Extend `generateTask()` to accept profile context

**File**: `src/lib/ai/task.ts` (edit existing)

Add an optional `profile?: LearnerProfile` parameter. When present and `hasEnoughSignal` is true:

- Append a block to the system prompt:
  > The student's accumulated error profile shows these recurring weak points: `<top 5 weakGrammar as subcategory: count>`. When choosing `target_grammar`, *prefer* these subcategories over generic level-appropriate picks, unless the document content makes them awkward. Avoid `target_grammar` subcategories the student has already mastered: `<strongGrammar sample>`.
- Append to the user message:
  > The student's CEFR level is `<cefrLevel>`. They have submitted `<totalSubmissions>` writing tasks so far.

Also add an optional `pinnedGrammar?: string[]` parameter (separate from `profile`). When present, this **overrides** the AI's `target_grammar` choice — the post-processor (in the server action, see Step 4) forces those subcategory ids into the final list. This is what the "Practice from pattern" button uses.

**Do not** add `pinnedGrammar` enforcement inside the AI prompt itself — keep it as deterministic post-processing, same pattern as `target_words` enforcement (PRD §7.3.3, already implemented in `tasks.ts:34–43`).

### Step 4 — Wire `generateWritingTask` server action

**File**: `src/lib/actions/tasks.ts` (edit existing `generateWritingTask`)

New signature (additive, backwards-compatible):

```ts
export async function generateWritingTask(
  documentId: string | null,           // ← now nullable for archive-sourced tasks
  vocabWords: string[] = [],
  opts?: {
    pinnedGrammar?: string[];          // forces these subcategories into target_grammar
    source?: "document" | "vocab" | "archive";  // for logging/debugging only
  },
): Promise<string>
```

Inside the action:

1. Fetch profile via `buildLearnerProfile()` (parallel with the document fetch).
2. If `documentId` is null → archive-sourced task: pass empty title/content/vocab to `generateTask`, but rely on profile + `pinnedGrammar` to shape it. Use a placeholder doc summary like `"(Targeted practice from your error archive)"`.
3. Pass `profile` and `pinnedGrammar` through to `generateTask`.
4. Post-process `target_grammar`:
   - If `pinnedGrammar` provided → `targetGrammar = [...new Set([...pinnedGrammar, ...result.target_grammar])].slice(0, 3)` (pinned first, then AI's picks, cap 3).
   - Otherwise leave as AI returned.
5. Existing `target_words` enforcement unchanged.
6. Insert with `documentId` possibly null — the schema already allows this (`writingTasks.documentId` has `onDelete: "set null"` and is nullable per `schema.ts:64`).

### Step 5 — New thin server action for the Practice button

**File**: `src/lib/actions/tasks.ts` (add)

```ts
export async function practiceFromPattern(
  category: ErrorCategory,
  subcategory: string,
): Promise<string> {
  // Validate subcategory belongs to category against ERROR_TAXONOMY
  // Call generateWritingTask(null, [], { pinnedGrammar: [subcategory], source: "archive" })
  // Return the new taskId
}
```

Validation: reject unknown subcategories using `ERROR_TAXONOMY[category]?.subcategories[subcategory]`. Throw a plain `Error` — caller surfaces a toast (existing pattern from S5 micro-drill).

### Step 6 — Wire the UI

**File**: `src/app/progress/_components/top-patterns.tsx` (edit)

Replace the placeholder `<Link href="/library">Practice →</Link>` with a client component button that calls `practiceFromPattern` and pushes `/practice?taskId=<id>`. Match the existing button/affordance style (text-xs, text-accent, hover:underline) — do **not** introduce a new primitive.

Loading state: while the action is pending, swap to "Generating…" disabled state with the spinner pattern from `WritingForm` (S3). Don't add a toast lib — the existing app surfaces errors via `alert()` or inline text only (S5 micro-drill uses inline error text — follow that).

Because `top-patterns.tsx` is currently a server component, the simplest split is:
- Keep `top-patterns.tsx` as the server wrapper.
- Add `top-patterns-action.tsx` ("use client") that renders just the button and owns the loading/error state.

This mirrors the S4 pattern of co-locating a small client island inside an otherwise-server page.

### Step 7 — Practice page entry point for archive-sourced tasks

**File**: `src/app/practice/page.tsx` (edit lightly)

Currently the "no taskId" empty state assumes the entry point is the Reader (`"Open a document in the Reader…"`). Reword to also mention the archive entry:

> Open a document in the Reader, or use **Practice** on a recurring pattern in Progress, to receive a personalised writing prompt.

Also handle the `doc === null` case in the task card header — for archive-sourced tasks there's no document to link back to. The existing `TaskCard` already accepts `doc: Document | null` (see `page.tsx:53`), so just verify the "FROM" label degrades gracefully (e.g. show "From your error archive" instead of a document title). Update `task-card.tsx` accordingly.

### Step 8 — Manual verification checklist

Following S6's manual-only verification pattern (no test suite in repo per CLAUDE.md):

1. With < 3 submissions: profile has `hasEnoughSignal: false`, document-based task generation behaves identically to S3. (Sanity: no prompt regression for new users.)
2. With ≥ 3 submissions and a clear weak subcategory: generate a doc-based task and confirm `target_grammar` now includes at least one weak subcategory from the profile.
3. Click "Practice" on a top-3 pattern: lands on `/practice?taskId=<id>`, the task card shows "From your error archive", `target_grammar` contains the pinned subcategory.
4. Submit the archive-sourced task: feedback flow (S4) works unchanged — no document context required.
5. Delete the document a task came from after generation: existing `onDelete: set null` keeps the task intact.

---

## 5. Files touched

**New**:
- `src/lib/learner-profile.ts` — types
- `src/lib/actions/learner-profile.ts` — `buildLearnerProfile()` server action
- `src/app/progress/_components/top-patterns-action.tsx` — client island for the Practice button

**Edited**:
- `src/lib/ai/task.ts` — accept `profile` + `pinnedGrammar`, augment prompt
- `src/lib/actions/tasks.ts` — extend `generateWritingTask`, add `practiceFromPattern`
- `src/app/progress/_components/top-patterns.tsx` — swap placeholder Link for the new client button
- `src/app/practice/_components/task-card.tsx` — handle `doc === null` ("From your error archive")
- `src/app/practice/page.tsx` — reword empty state copy

**Not touched** (intentionally):
- `src/lib/db/schema.ts` — no schema changes, no migration needed
- `src/lib/taxonomy.ts` — taxonomy is frozen (PRD §8.5)
- `src/lib/ai/feedback.ts`, S6 chart components — out of scope

---

## 6. Style & convention checklist

To keep diffs consistent with S1–S6:

- [ ] All DB access via `db.select()...` async/await, no SQLite-era APIs
- [ ] Server actions live in `src/lib/actions/*.ts`, `"use server"` at top, no API routes
- [ ] Region banners `/* ----- name ----- */` separate helpers in action files
- [ ] Zod schemas only at AI boundaries; internal types are plain TS
- [ ] Client islands co-located under `_components/` next to the route
- [ ] Tailwind via semantic tokens only (`text-accent`, `border-border`, `bg-surface`)
- [ ] No new UI primitives — reuse `Button` / `Chip` / `Card` from `src/components/ui/`
- [ ] `revalidatePath("/practice")` and `revalidatePath("/progress")` after task creation (matches S3/S5)
- [ ] French content NFC-normalised at insert (`.normalize("NFC")`, matches `tasks.ts:62`)
- [ ] No comments narrating *what* the code does — comments only for non-obvious *why* (CLAUDE.md)

---

## 7. Risks & open questions

| Risk | Mitigation |
|------|-----------|
| Profile prompt makes AI ignore the document's actual content (over-fitting to weak grammar) | Keep the profile as a *bias*, not a hard constraint, in the prompt wording. Only `pinnedGrammar` is enforced post-hoc. |
| `masteredVocab` extraction is too noisy (false positives from words inside non-flagged errors) | Cap at 200; only used to *avoid* recycling, never as a positive signal. If quality is poor, drop the slice — UI doesn't surface it. |
| Archive-sourced task with no document context produces bland prompts | Acceptable for v0.1 — author-only product. Revisit if "self-use 3× per week × 4 weeks" metric (PRD §14.1) suffers. |
| Trend classification (improving/stable/worsening) is unreliable with few errors | Only computed when `hasEnoughSignal` is true; never surfaced in UI yet — purely a prompt input. |

Open questions deferred to S7+1:
1. Should `practiceFromPattern` accept an optional `documentId` to anchor the task to a specific text? (Currently no — keeps the UX simple.)
2. Should `LearnerProfile` cache for the request lifetime? (Currently no — call sites are few; revisit if it shows up in traces.)

---

## 8. Definition of done

- [ ] `buildLearnerProfile()` returns a populated profile when there are ≥ 3 submissions and ≥ 5 errors.
- [ ] Document-based task generation references the profile in its prompt and picks weak subcategories more often than chance (verified by inspecting `target_grammar` on 3+ generated tasks).
- [ ] "Practice" button on Progress page generates a task whose `target_grammar` contains the clicked subcategory.
- [ ] Archive-sourced tasks (null `documentId`) round-trip through submit → feedback without regression.
- [ ] `npm run build` and `npm run lint` pass with no new warnings.
- [ ] Manual run-through of the 5-step verification checklist above.
