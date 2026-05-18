# Sprint 4 — Writing Feedback (The Soul Sprint)

> Turn the stub `/practice/[submissionId]/feedback` page into the real
> structured-feedback loop: AI emits taxonomy-classified errors, the page
> renders a three-column layout with inline highlights, and every error is
> persisted to the `errors` table so future sprints (S5–S7) can build the
> learner profile on top.

References: PRD §7.3.2, §8.3–8.4, §12.3, §13.2 (Sprint 4 row), §15.1.

---

## 1. Scope

The goal: replace the stub feedback page with the real "structured AI
feedback" loop. After Submit, the user lands on a three-column page where
every error is classified per `ERROR_TAXONOMY`, persisted to the `errors`
table, and shown with inline highlights + cards. Praise and Improvement are
separate (only `errors[]` flows into the learner profile).

### Strong-decision contracts to honour

- AI output **must** use Structured Outputs with a Zod schema (§12.3) — never
  parse free text.
- Spans are character offsets into `submission.contentFr`. NFC-normalize
  `contentFr` before persisting so AI-returned indices line up (§15.1 risk
  row on accents).
- Three card families (Error / Improvement / Praise) — improvements never
  enter the `errors` table.
- "Show full correction" is a **second click** (§5.5 No spoilers).
- Persist the raw packet to `submissions.feedbackJson` for replay / debug
  (§15.1).

### What's already in place (do not redo)

- `errors` table — schema is final (`src/lib/db/schema.ts:106`).
- `ERROR_TAXONOMY`, `CATEGORY_COLORS`, `ALL_SUBCATEGORIES`
  (`src/lib/taxonomy.ts`).
- Submission insert + redirect skeleton
  (`src/lib/actions/tasks.ts:59` `createSubmission`).
- Feedback page stub
  (`src/app/practice/[submissionId]/feedback/page.tsx`).
- OpenAI client + `MODELS.feedback` (`src/lib/ai/client.ts`).

---

## 2. Implementation Steps

### Step 1 — AI layer: `src/lib/ai/feedback.ts`

Mirror the style of `src/lib/ai/task.ts` and `src/lib/ai/lookup.ts`.

- Define a Zod `FeedbackSchema` matching PRD §8.4:
  - `errors: ErrorSchema[]` with
    `span { start: number, end: number }`, `original`, `correction`,
    `category` (enum of `ERROR_TAXONOMY` keys), `subcategory` (enum of all
    33 leaves), `trigger_context` nullable, `explanation_en`,
    `fr_examples: string[]`, `rule_id` nullable, `micro_drill` nullable.
  - `improvements: { span, original, suggestion, explanation_en }[]`.
  - `praise: string[]` (≥1 sentence, §7.3.2 requires praise card).
  - `overall_level_estimate: CefrLevel` (use `CEFR_LEVELS` from
    `src/lib/cefr.ts`).
  - `summary_en: string` (one-sentence overall summary, §8.4).
- Build the `category` / `subcategory` enums **from `ERROR_TAXONOMY`** so
  they stay in sync if the taxonomy ever changes.
- Export `FeedbackResult = z.infer<typeof FeedbackSchema>`.
- `generateFeedback(taskPrompt, targetWords, targetGrammar, level, contentFr)`
  using `openai.chat.completions.parse` + `zodResponseFormat`,
  `MODELS.feedback`, temperature ~0.2.
- System prompt requirements:
  - Socratic tone (§5.5) — explain why, do not over-reveal the corrected
    sentence in `explanation_en`.
  - List the valid subcategory IDs explicitly (same pattern as
    `task.ts:36`).
  - State that `span.start`/`span.end` must be character offsets into the
    exact `contentFr` provided.
  - Require ≥1 praise sentence even on weak submissions.

### Step 2 — Server actions: extend `src/lib/actions/tasks.ts`

Refactor `createSubmission` from a fire-and-redirect insert into a
two-phase flow. (Splitting into `src/lib/actions/feedback.ts` is optional
but acceptable if `tasks.ts` grows.)

1. NFC-normalize `contentFr` (`contentFr.normalize("NFC")`) before any DB
   write so all downstream span math lines up.
2. Insert the row into `submissions` with `wordCount`.
3. Call `generateFeedback(...)`.
4. Update `submissions` with `feedbackJson` (the raw packet),
   `estimatedLevel`, `praise`, `summaryEn`.
5. Bulk-insert one `errors` row per `FeedbackSchema.errors[i]`.
   Improvements are **not** inserted — they only live in `feedbackJson`.
6. `redirect("/practice/<id>/feedback")`.

Loading UX is already handled by `useTransition` in
`writing-form.tsx`. Optionally add a `loading.tsx` under
`src/app/practice/[submissionId]/feedback/` for streaming polish.

Add a read helper used by the page:

- `getSubmissionWithFeedback(submissionId)` → `{ submission, task, doc,
  errors }`. Follow the existing convention in
  `getWritingTaskWithDocument` (`tasks.ts:70`): separate awaited selects,
  no Drizzle JOIN helpers used elsewhere in the project.

### Step 3 — Feedback page: `src/app/practice/[submissionId]/feedback/page.tsx`

Replace the stub. Make it an async server component that:

- Calls `getSubmissionWithFeedback(submissionId)`; `notFound()` on miss
  (same pattern as `practice/page.tsx:39`).
- Renders a three-column desktop layout (PRD §7.3.2): left source excerpt
  (collapsible), centre submission with inline highlights, right feedback
  panel. Use a Tailwind grid like
  `grid-cols-[260px_minmax(0,1fr)_360px]`, matching the
  `bg-surface rounded-2xl border border-border shadow-sm p-6 space-y-5`
  card look already used in `task-card.tsx`.
- Header: page title "Feedback", overall CEFR chip
  (reuse `CEFR_CHIP_CLASSES` from `src/lib/cefr.ts`), `summary_en`, word
  count, "From <doc title>" line consistent with `task-card.tsx:20`.

### Step 4 — Components: `src/app/practice/[submissionId]/feedback/_components/`

Follow the file-per-component pattern already set by
`_components/task-card.tsx` and `_components/writing-form.tsx`.

- `source-excerpt.tsx` — collapsible left column. `font-serif`,
  reading-prose-ish container. Shows first 500 chars of `doc.content`
  with a "Show more" affordance. Fallback "Original document removed"
  when `task.documentId` is null, matching the fallback at
  `practice/page.tsx:46`.
- `submission-text.tsx` (client) — renders `contentFr` with `<mark>`
  spans for each error. Each highlight uses the category colour from
  `CATEGORY_COLORS` (see Step 5), shows a numeric superscript `¹²³…`,
  and links to the corresponding error card via a shared id
  (`#error-<n>`) for hover / scroll-into-view interaction.
- `error-card.tsx` (client) — original → correction with the correction
  hidden behind a `Show correction` button (§5.5). Includes category
  chip (uses `CATEGORY_COLORS`), human-readable subcategory label
  (from `ERROR_TAXONOMY[cat].subcategories[sub]`), `explanation_en`,
  French examples list, `trigger_context` rendered subtly only when
  non-null, placeholder anchor for `rule_id` (real link lands in S5).
- `improvement-card.tsx` — same shell as `error-card`, no taxonomy chip,
  neutral styling so it visually differs from real errors.
- `praise-card.tsx` — `success` chip variant, list of praise sentences.
- `feedback-panel.tsx` — orchestrates the right column ordering:
  Praise → Errors (grouped by category, in `ERROR_TAXONOMY` declaration
  order) → Improvements.

### Step 5 — Style / consistency checks

- Only semantic tokens (`text-muted-foreground`, `bg-surface`,
  `border-border`, `text-accent`, `text-success`, …). Never raw colour
  values.
- Category-colour highlights: extend `CATEGORY_COLORS` into a Tailwind
  class lookup **inside the feedback folder** (e.g.
  `category-styles.ts` colocated with the components):
  `amber → { underline: "decoration-amber-400",
  chip: "bg-amber-100 text-amber-800", badge: "bg-amber-50" }` etc. Keep
  `src/lib/taxonomy.ts` purely data — do not add Tailwind classes there.
- Chips: reuse the existing `Chip` primitive. If a per-category chip
  colour is needed, pass `className` — do not invent new variants in
  `chip.tsx`.
- All AI calls go through `openai.chat.completions.parse` +
  `zodResponseFormat`, exactly like `task.ts` / `lookup.ts`. No
  `JSON.parse`.
- All DB code is async Drizzle (`await db.select() … `,
  `await db.insert() … `). No `.run()` / `.get()` / `.all()`.
- Fonts: `font-serif` for reading content (source excerpt + submission
  text); `font-sans` for UI chrome and feedback labels.

### Step 6 — Edge cases to handle in S4

- **Empty errors array** → show a positive "Clean run" empty state in the
  centre/right columns instead of an empty list (matches §5.2 "errors are
  fuel" — keep tone encouraging).
- **Span out of bounds** → clamp `span.end` to `contentFr.length` and
  `span.start` to `>= 0`; log a warning but never crash the page.
- **Re-visiting a submission** that already has `feedbackJson` → render
  straight from the DB. Do not regenerate. The action only generates on
  the first submit.
- **Document deleted** before feedback render (`task.documentId == null`)
  → left column shows "Original document removed", consistent with the
  fallback at `practice/page.tsx:46`.
- **AI failure** → bubble up the error; the submission stays inserted
  (so the user does not lose their writing), but `feedbackJson` is null
  and the page can show a "Feedback failed — retry" affordance. (A retry
  action is a nice-to-have, can land later in S4 if time permits.)

### Step 7 — Out of scope for S4 (defer)

- **Micro-drill button** inside the error card — UI wired in S5
  (PRD §7.3.2 lists `Micro-drill` under S5).
- **`rule_id` → `rules` table linking** — S5.
- **Editing / re-submitting** — explicitly v2 (§15.2 #4).
- **Category trend visualisations** — S6.
- **Learner-profile-driven prompt injection** — S7.

---

## 3. File-by-file Deliverables

| Path | Action |
|------|--------|
| `src/lib/ai/feedback.ts` | **new** — Zod `FeedbackSchema` + `generateFeedback()` |
| `src/lib/actions/tasks.ts` | **edit** — rewrite `createSubmission` to two-phase; add `getSubmissionWithFeedback` |
| `src/app/practice/[submissionId]/feedback/page.tsx` | **rewrite** — replace stub with real three-column layout |
| `src/app/practice/[submissionId]/feedback/_components/source-excerpt.tsx` | **new** |
| `src/app/practice/[submissionId]/feedback/_components/submission-text.tsx` | **new** (client) |
| `src/app/practice/[submissionId]/feedback/_components/error-card.tsx` | **new** (client) |
| `src/app/practice/[submissionId]/feedback/_components/improvement-card.tsx` | **new** |
| `src/app/practice/[submissionId]/feedback/_components/praise-card.tsx` | **new** |
| `src/app/practice/[submissionId]/feedback/_components/feedback-panel.tsx` | **new** |
| `src/app/practice/[submissionId]/feedback/_components/category-styles.ts` | **new** — Tailwind class lookup per `CATEGORY_COLORS` |
| `src/app/practice/[submissionId]/feedback/loading.tsx` | **optional** — streaming skeleton |

No DB schema changes, no new migrations — `errors` and `submissions`
already carry every field S4 needs.

---

## 4. Suggested Build Order

1. **Step 1 (`feedback.ts`) + Step 2 (server action rewrite).**
   Unblocks everything visual. Verify by submitting once and inspecting
   `submissions.feedbackJson` and the `errors` rows in `npm run db:studio`.
2. **Step 3 (page) + Step 4 (components) skeleton.** Render the three
   columns with raw text first, no highlights yet.
3. **Inline highlights + numeric superscripts** in `submission-text.tsx`,
   wired to the right-column cards via `#error-<n>`.
4. **"Show correction" two-click interaction** in `error-card.tsx`.
5. **Empty-state polish + edge cases** from Step 6.
6. **Self-check against the PRD Sprint 4 checklist** (§13.2):
   - [ ] Full feedback Zod schema defined
   - [ ] Writing-correction server action (OpenAI structured output)
   - [ ] Error data written to `errors` table
   - [ ] Feedback Stage three-column layout
   - [ ] Inline highlights + numbered superscripts
   - [ ] Error / Praise / Improvement card families
   - [ ] "Show full correction" two-click interaction
