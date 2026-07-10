# Audit Remediation (2026-07-10) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the approved audit remediation: 9-item engineering cleanup package + PM weekly package (quick-write entry, study goal, readiness card, trend density, TCF question-attempt persistence, passage→writing, /today default home).

**Architecture:** All data access stays in `src/lib/actions/*` server actions (no API layer); new UI follows the existing cva/cn + semantic-token conventions; new table follows the uuid-PK + timestamptz convention. One commit per task on branch `audit-remediation-2026-07`.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle + postgres.js, Tailwind v4, recharts.

## Global Constraints

- **No test suite exists (per CLAUDE.md).** Each task's verify step = `npx tsc --noEmit` + `npx eslint src` + targeted manual check via dev server at the end. Do not introduce a test framework in this plan.
- UI copy: `(main)` routes use English, `/tcf` routes use French (existing convention).
- Colours only via semantic tokens (`text-accent`, `bg-surface`, …); reading text in `font-serif`.
- New tables: `uuid` PK `defaultRandom()`, `timestamp(..., { withTimezone: true })`.
- Commits end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Deliberately deferred (do NOT build here): P9 review queue, P8 session summaries, EE mode, error-loop steps 2–4 (tagging/smart queue/panels/review page), library difficulty hint, Azure key value (user provides).

---

### Task 1: Repo hygiene — worktrees, lint noise, pipeline scripts

**Files:**
- Modify: `eslint.config.mjs` (add `.claude/**` to `globalIgnores`)
- Modify: `.gitignore` (remove the `scripts/` ignore line; keep `public/media/` + `data/`)
- Ops: `git worktree remove` for `.claude/worktrees/vocab-memory` (branch `worktree-vocab-memory` is merged) and `.claude/worktrees/youthful-booth-1abb64` (detached at ae069d0); delete the merged branch; `git branch audit-remediation-2026-07 && git switch`

- [ ] **Step 1:** Confirm worktrees are clean/merged (`git -C <wt> status --porcelain`, `git branch --merged main`), then remove both worktrees + merged branch. If a worktree is dirty, stop and report instead of forcing.
- [ ] **Step 2:** eslint ignore + gitignore edit + `git add scripts/`.
- [ ] **Step 3:** Verify: `git worktree list` → only main checkout; `npx eslint . 2>&1 | tail -3` → ≤6 problems (the 5 known + margin).
- [ ] **Step 4:** Commit `chore: repo hygiene — track pipeline scripts, silence worktree lint noise`.

### Task 2: Close exposure surface + vocab transaction + assess-route input validation

**Files:**
- Modify: `src/lib/ai/{lookup,transcribe,cefr-estimator,quiz-parse,cloze-select,enrich}.ts` — delete the `"use server"` directive (they are plain server-side libs; real entry points live in `lib/actions/`)
- Modify: `src/lib/vocabulary/helpers.ts` — each write helper gains an optional trailing executor param
- Modify: `src/lib/actions/vocabulary.ts` — cache-miss path of `resolveLookup` wraps the three writes in `db.transaction`
- Modify: `src/app/api/speaking/assess/route.ts` — UUID-validate `sessionId`, cap `audio.size` at 10 MB, validate before any disk write

**Interfaces:**
```ts
// helpers.ts
export type Dbx = typeof db | Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];
export async function upsertEntry(lemma: string, surface: string, result: LookupResult, dbx: Dbx = db)
export async function upsertAlias(surface: string, lemma: string, dbx: Dbx = db)
export async function recordOccurrence(opts: {...}, dbx: Dbx = db)
```

- [ ] **Step 1:** `grep -rn "from \"@/lib/ai/(lookup|transcribe|…)\"" src/app src/components` — confirm no client component imports a *function* (type imports fine) before deleting the directives.
- [ ] **Step 2:** Apply the four file groups above.
- [ ] **Step 3:** `npx tsc --noEmit` → clean.
- [ ] **Step 4:** Commit `fix: close server-action exposure, vocab write transaction, assess-route validation`.

### Task 3: Stale-pending feedback gets an exit

**Files:**
- Modify: `src/app/(main)/practice/[submissionId]/feedback/page.tsx`
- Modify: `.../_components/feedback-retry.tsx` — new optional prop `stalePending?: boolean` switches headline/copy

**Logic:** `feedbackStatus === "pending"` renders `<FeedbackPending/>` only while `Date.now() - submittedAt < 3 min`; older pending renders `<FeedbackRetry stalePending/>` ("Still generating after several minutes — the background job likely died. Your writing is safe; retry now."). `regenerateFeedback` already exists and is re-entrant.

- [ ] Implement, `npx tsc --noEmit`, commit `fix: stale pending feedback offers retry instead of spinning forever`.

### Task 4: Documentation refresh

**Files:**
- Modify: `CLAUDE.md` — status (MVP S1–S7 + v0.2 S8–S10 + Speaking P1 shipped; next = TCF error loop), commands (`db:seed-rules`, `db:reenrich`), DB section (postgres.js driver, ~23 tables incl. quiz engine / TCF / speaking groups), env (`AZURE_SPEECH_KEY/REGION` optional), replace "Coming sprints" with pointer to `docs/superpowers/specs/`
- Modify: `README.md` — status section reflects current feature set
- Modify: `src/components/sidebar.tsx:126` — footer label `v0.2 · self`

- [ ] Implement, commit `docs: bring CLAUDE.md/README/version label up to current architecture`.

### Task 5: P2a — one-click writing entry

**Files:**
- Modify: `src/lib/actions/tasks.ts`
- Create: `src/app/(main)/practice/_components/quick-write-button.tsx`
- Modify: `src/app/(main)/practice/page.tsx` (empty state)

**Interfaces:**
```ts
// tasks.ts — reuses generateWritingTask(null, [], { source: "archive" })
export async function quickWrite(): Promise<void> // generates then redirect(`/practice?taskId=${id}`)
```
Button: `useTransition`; primary CTA "Écrire maintenant" with sub-copy "A prompt tuned to your error profile — no document needed"; spinner label "Generating your task… ~10s". Library link demoted to secondary.

- [ ] Implement, `npx tsc --noEmit`, commit `feat(practice): one-click writing task from the error archive`.

### Task 6: P4 study goal + P6 readiness card

**Files:**
- Modify: `src/lib/actions/settings.ts`
- Create: `src/app/(main)/settings/_components/study-goal-editor.tsx`
- Modify: `src/app/(main)/settings/page.tsx`
- Create: `src/lib/actions/readiness.ts`
- Create: `src/app/(main)/progress/_components/readiness-card.tsx`
- Modify: `src/app/(main)/progress/page.tsx` (render above the dashboard gate)

**Interfaces:**
```ts
// settings.ts — KV keys "target_clb", "exam_date"
export type StudyGoal = { targetClb: number | null; examDate: string | null };
export async function getStudyGoal(): Promise<StudyGoal>
export async function setStudyGoal(goal: StudyGoal): Promise<void>

// readiness.ts
export type SkillReadiness = {
  skill: "listening" | "reading" | "writing" | "speaking";
  status: "no_data" | "low_sample" | "ok";
  label: string | null;   // "B1" | "78/100"
  detail: string;         // human sentence incl. sample size
  samples: number;
};
export type ReadinessSummary = {
  goal: StudyGoal & { daysLeft: number | null; targetCefr: CefrLevel | null };
  skills: SkillReadiness[];
};
export async function getReadinessSummary(): Promise<ReadinessSummary>
```
Heuristics (honesty over precision — no score predictions):
- listening/reading: sum `tcf_attempts.perLevel` over last 90 days per skill; estimate = highest CEFR level with ≥8 answered and ≥60 % accuracy; `ok` needs ≥1 qualifying level, else `low_sample` (some attempts) / `no_data`.
- writing: latest `submissions.estimatedLevel`; `ok` at ≥3 submissions, else `low_sample`/`no_data`.
- speaking: mean `scores.overall` of completed sessions, label "NN/100".
- CLB→CEFR display map: 4–5→B1, 6–7→B2, 8–9→C1, 10→C2.
- Card: goal line ("Objectif CLB 7 ≈ B2 · exam in 143 days" or "Set your target →" linking /settings) + 4 skill tiles; `low_sample`/`no_data` tiles render muted with the reason.

- [ ] Implement, `npx tsc --noEmit`, commit `feat(progress): study goal + four-skill readiness card`.

### Task 7: P7 trend chart → error density

**Files:**
- Modify: `src/lib/actions/errors.ts` (`getErrorTrend`)
- Modify: `src/app/(main)/progress/_components/trend-chart.tsx`

**Interfaces:**
```ts
export type TrendBucket = { weekLabel: string; errors: number; words: number; density: number | null };
```
Second grouped query on `submissions` (`date_trunc('week', submitted_at)`, `sum(word_count)`); `density = words > 0 ? round(errors / words * 100, 1) : null`. Chart becomes `ComposedChart`: words as muted bars (right axis), density as accent line (left axis, `connectNulls={false}`); tooltip shows density, absolute errors, words. Category mix stays covered by the adjacent DistributionChart.

- [ ] Implement, `npx tsc --noEmit`, commit `feat(progress): trend chart shows errors per 100 words`.

### Task 8: Error-loop data layer (spec §3–4, step 1 only)

**Files:**
- Modify: `src/lib/db/schema.ts`; generate migration 0015 (`npm run db:generate` then `npm run db:init`)
- Modify: `src/lib/actions/tcf.ts`
- Modify: `src/app/tcf/drill/page.tsx`, `src/app/tcf/_components/drill-runner.tsx`, `src/app/tcf/_components/level-nav.tsx`, `src/app/tcf/_components/exam-runner.tsx`
- Delete: `src/hooks/use-done-questions.ts`

**Schema (per approved spec):**
```ts
export const tcfAttemptModeEnum = pgEnum("tcf_attempt_mode", ["drill", "exam"]);
export const tcfQuestionAttempts = pgTable("tcf_question_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  questionId: uuid("question_id").notNull().references(() => tcfQuestions.id, { onDelete: "cascade" }),
  mode: tcfAttemptModeEnum("mode").notNull(),
  examAttemptId: uuid("exam_attempt_id").references(() => tcfAttempts.id, { onDelete: "set null" }),
  chosen: integer("chosen").notNull(),
  correct: boolean("correct").notNull(),
  answeredAt: timestamp("answered_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("tcf_qa_question_id_idx").on(t.questionId),
  index("tcf_qa_answered_at_idx").on(t.answeredAt),
  index("tcf_qa_exam_attempt_id_idx").on(t.examAttemptId),
]);
// + tcfQuestions.skillTags: jsonb("skill_tags").$type<string[]>()  (nullable; tagging = later step)
```

**Actions:**
```ts
export async function recordTcfQuestionAttempt(input: { questionId: string; chosen: number; correct: boolean }): Promise<void> // mode 'drill', no revalidate
export type TcfExamAnswer = { questionId: string; chosen: number; correct: boolean };
// recordTcfExamAttempt gains `answers?: TcfExamAnswer[]` — transaction: insert tcf_attempts returning id, batch-insert answers with mode 'exam'
export async function getTcfDoneQuestionIds(skill: "listening" | "reading", level: TcfLevel): Promise<string[]>
```

**Client wiring (per spec §4.2):** drill page prefetches done ids → `DrillRunner` prop `initialDoneIds: string[]` seeds local `Set` state; `choose()` adds to set + fire-and-forget `recordTcfQuestionAttempt(...).catch(() => {})`; **revealing the answer no longer marks done**; LevelNav loses the "Effacer" button (history is a data asset); ExamRunner extracts one `computeScore(questions, answers)` helper used by both the render memo and `handleFinish`, and passes the per-question array.

- [ ] Schema + `npm run db:generate` + `npm run db:init`; verify migration applies.
- [ ] Actions + client wiring; delete the hook; `npx tsc --noEmit && npx eslint src`.
- [ ] Commit `feat(tcf): persist per-question attempts; done-state derived from DB`.

### Task 9: P12c — writing task from a TCF reading passage

**Files:**
- Modify: `src/lib/actions/tasks.ts`
- Modify: `src/app/tcf/_components/drill-runner.tsx`

**Interfaces:**
```ts
export async function writeFromTcfPassage(questionId: string): Promise<string> // returns taskId
// fetch tcf_questions + set; requires passage != null; calls generateTask(
//   `TCF lecture · test ${testNumber}`, "news", passage, question.level, [], { profile })
// inserts writing_tasks with documentId null
```
Entry: under the passage `<article>` (reading_mcq with passage), outline button "Écrire sur ce texte" (PenLine icon) → `useTransition` → `router.push(\`/practice?taskId=${id}\`)`.

- [ ] Implement, `npx tsc --noEmit`, commit `feat(tcf): generate a writing task from a reading passage`.

### Task 10: /today daily plan as default home (P1 + P5 filtering)

**Files:**
- Create: `src/lib/actions/today.ts`
- Create: `src/app/(main)/today/page.tsx`
- Modify: `src/app/page.tsx` (redirect `/today`), `src/components/sidebar.tsx` (Today entry first; Library matcher drops `p === "/"`)

**Interfaces:**
```ts
export type TodayBlock = {
  key: "tcf" | "writing" | "review";
  title: string;
  detail: string;                    // why this was chosen (transparency)
  href: string | null;               // null → block renders its own CTA (writing uses QuickWriteButton)
  done: boolean;
  progress?: { done: number; target: number };
};
export type TodayPlan = {
  streak: number; activeToday: boolean; cefr: CefrLevel;
  goal: { targetClb: number | null; daysLeft: number | null };
  blocks: TodayBlock[];
};
export async function getTodayPlan(): Promise<TodayPlan>
```
Heuristics (no AI):
- **TCF block:** accuracy per (skill, level) from `tcf_question_attempts` last 30 d, levels restricted to cefr ±1 (P5); pick lowest accuracy with ≥5 samples → "Your weakest: listening B1 — 45 % over 30 days"; fallback = least-recently-practised allowed combo; cold start = `skill` alternating on day-of-year parity at `cefr`. `href = /tcf/drill?skill&level`; progress = today's drill answers vs 10.
- **Writing block:** done = submission today; detail = "Last writing: N days ago" (or "No writing yet"); CTA = existing `QuickWriteButton`.
- **Review block:** href `/conjugation`; done = any `conjugation_attempts` today; detail names the top recurring error pattern (`getTopRecurringPatterns(1)`) + saved-word count.
- **Streak:** distinct activity dates over last 60 d across submissions / tcf_question_attempts / conjugation_attempts / quiz_attempts, count consecutive days ending today (or yesterday when today inactive).
Page: date header, streak, goal line, three cards with done checkmarks. Uses only semantic tokens; heading `font-serif`.

- [ ] Implement, `npx tsc --noEmit && npx eslint src`, commit `feat(today): daily plan page becomes the default home`.

### Task 11: End-to-end verification

- [ ] `preview_start` dev server; walk `/today`, `/progress`, `/settings`, `/practice`, `/tcf/drill?skill=reading&level=A2`: no console errors; readiness card renders "no data" states honestly; drill answer click → `tcf_question_attempts` row exists (re-run scratchpad db-audit); done marks survive reload.
- [ ] `npm run build` passes.

## Self-Review

- Spec coverage: engineering items R1–R6/#26/R9/R3 → Tasks 1–4; P2a→5, P4+P6→6, P7→7, error-loop step 1→8, P12c→9, P1+P5→10. Azure key intentionally out (user-side); deferred list in Global Constraints.
- Type consistency: `TcfExamAnswer`, `TodayBlock`, `SkillReadiness`, `StudyGoal`, `Dbx` each defined once and consumed as named.
- No placeholders: heuristics and copy specified inline above.
