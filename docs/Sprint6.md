# Sprint 6 — Progress Dashboard + Trends + CEFR Level Setting

> Transform the Progress page from a raw errors archive into a real learning
> dashboard: four stat cards, a multi-line error-rate trend chart, a horizontal
> distribution bar chart, and the Top-3 recurring patterns panel. Wire the
> 30/90/365-day window toggle, integrate Recharts, and add the manual CEFR
> level picker to Settings.

References: PRD §7.4.1 (Progress must-have features), §7.5 (Settings — CEFR
level, S6), §12.1 (Recharts introduced in S6), §13.2 (Sprint 6 row), §15.1
(risk: sparse data guard), Sprint 5's "Out of scope for S5" list (all charts
and stats explicitly deferred here).

---

## 1. Scope

After S5 the Progress page is a fully-functional errors archive with category
filtering, sentence-snippet cards, and micro-drill dialogs. What it lacks is
the *dashboard layer* that makes long-term growth visible. S6 adds:

1. **Top four stat cards** — Submissions, Errors Logged, Active Days, Most
   Improved category.
2. **Error-rate trend chart** — multi-line Recharts `LineChart`, one line per
   category, with a 30/90/365-day window toggle.
3. **Error distribution bar chart** — horizontal Recharts `BarChart` showing
   cumulative errors per category, coloured to match `CATEGORY_STYLES`.
4. **Top-3 recurring patterns** — the three subcategories with the most total
   errors, each card showing a representative example and a placeholder
   "Practice →" link (S7 will wire the actual task generation).
5. **Encouragement banner** — a single positive sentence at the bottom of the
   dashboard, computed from the stats (e.g. "Your Grammar errors are down 30%
   this month — keep going.").
6. **Sparse-data guard** — charts and stat cards render a friendly "Not enough
   data yet" state until the user has ≥ 3 submissions (PRD §15.1).
7. **Settings: manual CEFR level** — a level picker in Settings that persists
   to a new `user_settings` table (PRD §7.5, S6 row).

### Strong-decision contracts to honour

- **No streak / gamification** (§7.4.2 / §11.2). Stat cards show neutral
  counts and a growth signal, not a score.
- **No raw colour values** in components; only semantic tokens
  (`bg-surface`, `text-muted-foreground`, etc.) and the existing
  `CATEGORY_STYLES` palette from `src/lib/category-styles.ts`.
- **All DB queries are async Drizzle** (`await db.select()…`). Never `.run()`
  / `.get()` / `.all()` (SQLite-only). Use `sql` tagged literals for
  `date_trunc` and other PostgreSQL expressions.
- **Recharts components are always `"use client"`** — wrap them in
  thin client components so the dashboard page itself stays a server
  component.
- **S7 deferred**: the "Practice →" button on Top-3 patterns links to
  `/practice` with a stub `?pattern=<subcategory>` query param but does not
  yet trigger task generation. Leave a clear TODO comment.

### What's already in place (do not redo)

- `src/app/progress/page.tsx` — async server component with category filter,
  `getProgressStats()`, `listErrors()`, `getErrorCounts()`, `batchGetRules()`.
  S6 restructures this page — it does not rewrite the archive section.
- `src/lib/actions/errors.ts` — `getProgressStats()` returns
  `{ totalErrors, totalSubmissions }`. S6 adds `getDashboardStats()`,
  `getErrorTrend()`, `getTopRecurringPatterns()`.
- `src/lib/category-styles.ts` — `CATEGORY_STYLES` with `chip` and `mark`
  class strings; used by archive cards. S6 chart components read the same map
  for line/bar colours, so add a `chartColor` field (Step 3).
- `src/lib/cefr.ts` — `CEFR_LEVELS`, `CefrLevel`, `CEFR_CHIP_CLASSES`.
- `date-fns` ^4 — already installed; use it for bucket-label formatting.
- `recharts` — **not yet installed** (Step 1).

---

## 2. Implementation Steps

### Step 1 — Install Recharts

```bash
npm install recharts
```

No additional type package needed — Recharts ships its own TypeScript types.
Verify the install resolves cleanly: `npm run build` should still pass.

### Step 2 — Add `chartColor` to `CATEGORY_STYLES`

`src/lib/category-styles.ts` currently has `chip` and `mark` per category.
Recharts needs a hex or CSS colour string for stroke/fill. Add a `chartColor`
field, keeping the values consistent with the existing tint palette:

```ts
export type CategoryStyle = {
  chip: string;
  mark: string;
  chartColor: string;   // ← new
};

export const CATEGORY_STYLES: Record<ErrorCategory, CategoryStyle> = {
  Grammar:          { chip: "bg-amber-100 text-amber-800",   mark: "bg-amber-100",   chartColor: "#F59E0B" },
  GenderAgreement:  { chip: "bg-rose-100 text-rose-800",     mark: "bg-rose-100",    chartColor: "#F43F5E" },
  Articles:         { chip: "bg-violet-100 text-violet-800", mark: "bg-violet-100",  chartColor: "#8B5CF6" },
  Prepositions:     { chip: "bg-red-100 text-red-800",       mark: "bg-red-100",     chartColor: "#EF4444" },
  Pronouns:         { chip: "bg-emerald-100 text-emerald-800", mark: "bg-emerald-100", chartColor: "#10B981" },
  NegationQuestion: { chip: "bg-cyan-100 text-cyan-800",     mark: "bg-cyan-100",    chartColor: "#06B6D4" },
  Vocabulary:       { chip: "bg-blue-100 text-blue-800",     mark: "bg-blue-100",    chartColor: "#3B82F6" },
  Orthography:      { chip: "bg-stone-100 text-stone-800",   mark: "bg-stone-100",   chartColor: "#78716C" },
  Syntax:           { chip: "bg-fuchsia-100 text-fuchsia-800", mark: "bg-fuchsia-100", chartColor: "#D946EF" },
};
```

No other file changes are needed — `CATEGORY_STYLES` is already imported
everywhere that needs the colour.

### Step 3 — DB: `user_settings` table + migration

Add to `src/lib/db/schema.ts`. Mirror the minimal-and-stable approach already
used for all other tables (text PK, `defaultNow()` timestamp):

```ts
export const userSettings = pgTable("user_settings", {
  /** Stable key, e.g. "cefr_level" */
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type UserSetting = typeof userSettings.$inferSelect;
```

Then:

```bash
npm run db:generate   # creates drizzle/<timestamp>_user_settings.sql
npm run db:init       # applies migration
```

Verify in `npm run db:studio`: `user_settings` table exists and is empty.

The CEFR level key is `"cefr_level"` with values from `CEFR_LEVELS`
(`"A1"` … `"C2"`). No other keys are stored in this sprint.

### Step 4 — Server actions: new queries in `errors.ts`

Follow the existing conventions in `src/lib/actions/errors.ts` — `"use server"`
at top, async Drizzle only, `revalidatePath` on writes, separate awaited selects
(no Drizzle JOIN helpers).

Import additions needed at the top of the file:

```ts
import { sql, gte, lte, asc } from "drizzle-orm";
import { submissions } from "@/lib/db/schema";
```

#### 4a — `getDashboardStats()`

Returns the four numbers that drive the top stat cards.

```ts
export async function getDashboardStats(): Promise<{
  totalSubmissions: number;
  totalErrors: number;
  activeDays: number;
  mostImprovedCategory: string | null;   // ErrorCategory key or null if < 2 periods
}> 
```

Implementation notes:

- **totalSubmissions**: `SELECT COUNT(*) FROM submissions`.
- **totalErrors**: `SELECT COUNT(*) FROM errors`.
- **activeDays**: `SELECT COUNT(DISTINCT date_trunc('day', submitted_at)::date)
  FROM submissions` — use `sql` tagged literal for the `date_trunc` call:
  ```ts
  db.select({
    days: sql<number>`count(distinct date_trunc('day', ${submissions.submittedAt})::date)`,
  }).from(submissions)
  ```
- **mostImprovedCategory**: compare error counts in the last 30 days vs the
  prior 30 days. Fetch rows once and compute in application code:
  1. `SELECT category, created_at FROM errors WHERE created_at >= now() - interval '60 days'`.
  2. Split into "current period" (last 30 days) and "prior period" (30-60 days ago).
  3. Tally per category. The category whose count fell the most (absolutelycount) is "Most Improved". If all categories went up or no prior data exists, return `null`.

#### 4b — `getErrorTrend(windowDays: 30 | 90 | 365)`

Returns weekly-bucketed error counts per category, ready for Recharts
`LineChart`.

```ts
export type TrendBucket = {
  weekLabel: string;           // "Jan 6", "Feb 3", etc — formatted with date-fns
  [category: string]: number | string;  // one key per ErrorCategory
};

export async function getErrorTrend(windowDays: 30 | 90 | 365): Promise<TrendBucket[]>
```

Implementation:

1. Query raw rows:
   ```ts
   const startDate = new Date(Date.now() - windowDays * 86_400_000);
   const rows = await db
     .select({
       week: sql<string>`date_trunc('week', ${errors.createdAt})::text`,
       category: errors.category,
       count: count(),
     })
     .from(errors)
     .where(gte(errors.createdAt, startDate))
     .groupBy(sql`date_trunc('week', ${errors.createdAt})`, errors.category)
     .orderBy(asc(sql`date_trunc('week', ${errors.createdAt})`));
   ```
2. Pivot in application code: group by `week`, then for each week produce an
   object with one key per category. Missing categories default to `0`.
3. Format `weekLabel` with `date-fns`: `format(parseISO(row.week), "MMM d")`.

Return the full ordered array; the client chart component handles
rendering and the 30/90/365 toggle (the toggle re-fetches via a client
`useTransition` or, simpler for a personal app, encodes the selected window
in the URL as `?window=30|90|365` — prefer the URL approach to keep the page
server-rendered where possible).

The `window` query param is already parsed (but no-op) in the S5 page; S6
wires it.

#### 4c — `getTopRecurringPatterns(limit = 3)`

```ts
export type RecurringPattern = {
  category: string;
  subcategory: string;
  subcategoryLabel: string;      // human-readable from ERROR_TAXONOMY
  count: number;
  exampleOriginal: string;       // from a representative error row
  exampleCorrection: string;
  exampleExplanation: string;
};

export async function getTopRecurringPatterns(
  limit = 3,
): Promise<RecurringPattern[]>
```

Implementation:

1. Group query:
   ```ts
   const groups = await db
     .select({ category: errors.category, subcategory: errors.subcategory, count: count() })
     .from(errors)
     .groupBy(errors.category, errors.subcategory)
     .orderBy(desc(count()))
     .limit(limit);
   ```
2. For each group, fetch one representative error row (the most recent) for
   the example snippet.
3. Resolve `subcategoryLabel` from `ERROR_TAXONOMY[category].subcategories[subcategory]`.

### Step 5 — Server action: CEFR level in `settings.ts`

Add to `src/lib/actions/settings.ts`:

```ts
import { db } from "@/lib/db";
import { userSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { CefrLevel } from "@/lib/cefr";
import { CEFR_LEVELS } from "@/lib/cefr";
import { revalidatePath } from "next/cache";

export async function getCefrLevel(): Promise<CefrLevel | null> {
  const row = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.key, "cefr_level"))
    .limit(1)
    .then((r) => r[0] ?? null);
  const val = row?.value;
  return CEFR_LEVELS.includes(val as CefrLevel) ? (val as CefrLevel) : null;
}

export async function setCefrLevel(level: CefrLevel): Promise<void> {
  await db
    .insert(userSettings)
    .values({ key: "cefr_level", value: level })
    .onConflictDoUpdate({
      target: userSettings.key,
      set: { value: level, updatedAt: new Date() },
    });
  revalidatePath("/settings");
}
```

### Step 6 — Dashboard stat cards: `src/app/progress/_components/stat-cards.tsx`

Server component (no interactivity). Mirrors the visual weight of library
doc-row cards: `rounded-2xl border border-border bg-surface p-6`.

Four cards in a 2×2 grid on mobile, 4-column on desktop
(`grid-cols-2 sm:grid-cols-4 gap-4`):

| Card | Value | Sub-label |
|------|-------|-----------|
| **Submissions** | `totalSubmissions` | "writing attempts" |
| **Errors Logged** | `totalErrors` | "classified errors" |
| **Active Days** | `activeDays` | "days with practice" |
| **Most Improved** | category label (or "—" when null) | "compared to last month" |

Design details:
- Metric value: `font-serif text-4xl font-semibold text-foreground`.
- Sub-label: `text-xs text-muted-foreground mt-1`.
- "Most Improved" card: render the category chip using `CATEGORY_STYLES[cat].chip`
  when non-null; show "—" in `text-muted-foreground` otherwise.
- Do **not** add up/down arrows or delta percentages — the PRD explicitly
  rejects gamification signals.

### Step 7 — Trend chart: `src/app/progress/_components/trend-chart.tsx`

`"use client"` component. Receives `data: TrendBucket[]` and `windowDays:
30 | 90 | 365` as props; renders a Recharts `ResponsiveContainer` +
`LineChart`.

```ts
"use client";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  Tooltip, Legend, CartesianGrid,
} from "recharts";
import { CATEGORY_STYLES } from "@/lib/category-styles";
import type { ErrorCategory } from "@/lib/taxonomy";
import { ERROR_TAXONOMY } from "@/lib/taxonomy";
```

Implementation notes:

- Height: `h-64` (256 px).
- One `<Line>` per `ErrorCategory` key in `ERROR_TAXONOMY` order. Use
  `chartColor` from `CATEGORY_STYLES[cat]` for the `stroke`.
- `XAxis dataKey="weekLabel"`, `YAxis` integer ticks only
  (`tickFormatter={(v) => Number.isInteger(v) ? v : ""}`).
- `CartesianGrid strokeDasharray="3 3"` with `stroke="var(--border)"`.
- `Tooltip` and `Legend` use default Recharts styling — no custom renderer
  needed.
- Only render lines for categories that have at least one non-zero data
  point in the current window (suppresses clutter from zero-error categories).

**Window toggle**: three buttons (`30d / 90d / 365d`) above the chart. They
update the `?window=` URL param using Next.js `useRouter` + `useSearchParams`
(same pattern as `progress-filters.tsx`). The parent page reads `window` from
`searchParams` and passes the pre-fetched `data` prop.

### Step 8 — Distribution chart: `src/app/progress/_components/distribution-chart.tsx`

`"use client"` component. Receives `counts: Record<ErrorCategory, number>` as prop (already available from `getErrorCounts()` called in the parent page).

```ts
"use client";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  Tooltip, Cell,
} from "recharts";
```

Implementation:

- Derive `data = Object.entries(counts).map(([cat, count]) => ({ cat, count }))`,
  sorted descending by `count`.
- Horizontal bar: rotate the chart (`layout="vertical"`) with `YAxis` showing
  the category short label (use `ERROR_TAXONOMY[cat].label`).
- Each bar gets its `chartColor` from `CATEGORY_STYLES[cat]` via `<Cell>`.
- `XAxis` integer ticks; `Tooltip` default.
- Height: `h-64`.
- Clicking a bar navigates to `/progress?category=<cat>` using `useRouter`
  — this is the "click category to drill-down" affordance from PRD §7.4.1.
  Cursor: `cursor-pointer` on the bar.

### Step 9 — Top-3 patterns: `src/app/progress/_components/top-patterns.tsx`

Server component. Receives `patterns: RecurringPattern[]` prop.

Layout: a section heading "Most frequent errors" + three cards, stacked
vertically (`space-y-3`). Card anatomy (same visual shell as
`archived-error-card.tsx`):

- Category chip + subcategory label (header row, reuse `CATEGORY_STYLES`).
- Example original → correction in small serif text.
- Count line: `{count} times` in `text-muted-foreground`.
- **"Practice →"** link — for S6, render as:
  ```tsx
  {/* TODO S7: wire to generate a targeted writing task */}
  <Link href="/library" className="text-xs text-accent hover:underline">
    Practice →
  </Link>
  ```
  The link goes to `/library` for now (the user picks a document there);
  S7 will change this to trigger task generation directly.

If `patterns.length === 0`, render nothing (the sparse-data guard in Step 11
handles the empty state before this section even mounts).

### Step 10 — Encouragement banner: `src/app/progress/_components/encouragement-banner.tsx`

Server component. Receives the dashboard stats and derives a single positive
sentence at render time (no AI call — just conditional string selection):

```ts
function encouragementText(stats: DashboardStats): string {
  if (stats.totalSubmissions === 0) return "";
  if (stats.mostImprovedCategory) {
    const label = ERROR_TAXONOMY[stats.mostImprovedCategory as ErrorCategory]?.label;
    return `Your ${label} errors are trending down — keep it up.`;
  }
  if (stats.totalErrors > 20) {
    return `${stats.totalErrors} errors logged and classified — every one is a step forward.`;
  }
  return "You're building a track record. Submit more tasks to see your trends.";
}
```

Render as a `rounded-2xl border border-border bg-surface/50 px-6 py-4` pill
at the bottom of the dashboard section, `font-serif text-sm text-muted-foreground`.
Do not render when `totalSubmissions === 0`.

### Step 11 — Rework `src/app/progress/page.tsx`

This is the main integration step. Keep the existing archive section; add the
dashboard layer above it. The final page order:

```
Header (title + subtitle)
  ↓
[sparse-data guard: < 3 submissions]
  show: "Submit at least 3 writing tasks to unlock your progress dashboard."
[else:]
  StatCards (Step 6)
  ─── divider ───
  <2-column grid: TrendChart (left 60%) + DistributionChart (right 40%)>
  ─── divider ───
  TopPatterns (Step 9)
  ─── divider ───
  EncouragementBanner (Step 10)
  ─── divider ───
Filter bar (existing S5)
Error archive list (existing S5)
```

Page-level data loading changes — extend the `Promise.all` to include the new
queries:

```ts
const [errorList, errorCounts, dashboardStats, trend, patterns, filterDoc] =
  await Promise.all([
    listErrors({ category: activeCategory, subcategory, documentId, limit: 200 }),
    getErrorCounts({ documentId }),
    getDashboardStats(),
    getErrorTrend(parsedWindow),   // 30 | 90 | 365, from searchParams.window
    getTopRecurringPatterns(3),
    documentId ? getDocument(documentId) : Promise.resolve(null),
  ]);
```

Remove the placeholder line:

```tsx
<p className="mt-0.5 text-xs text-muted-foreground">
  Trends and charts arrive in S6.
</p>
```

Parse `searchParams.window`:

```ts
const VALID_WINDOWS = [30, 90, 365] as const;
type WindowDays = (typeof VALID_WINDOWS)[number];
const rawWindow = Number((await searchParams).window);
const parsedWindow: WindowDays = VALID_WINDOWS.includes(rawWindow as WindowDays)
  ? (rawWindow as WindowDays)
  : 30;
```

Pass `windowDays={parsedWindow}` into `TrendChart` so the active toggle button
is highlighted correctly.

### Step 12 — Settings: CEFR level section

Extend `src/app/settings/page.tsx`. The page is already an async server
component — call `getCefrLevel()` at the top alongside `testApiKey()`:

```ts
const [status, cefrLevel] = await Promise.all([testApiKey(), getCefrLevel()]);
```

Add a new `<section>` below the API key card:

```tsx
<section className="rounded-2xl border border-border bg-surface p-6 space-y-5">
  <div className="flex items-center gap-2">
    <GraduationCap className="h-4 w-4 text-muted-foreground" />
    <h2 className="font-medium text-sm">Your CEFR Level</h2>
  </div>
  <p className="text-xs text-muted-foreground">
    Sets the difficulty of AI-generated writing tasks. The AI also estimates
    your level after each submission — this is your self-declared baseline.
  </p>
  <CefrLevelPicker currentLevel={cefrLevel} />
</section>
```

Create `src/app/settings/_components/cefr-level-picker.tsx` (client):

- Renders 6 button-style chips for A1 → C2 in a row, using `CEFR_CHIP_CLASSES`
  for the active chip and a neutral `bg-surface border border-border` for
  inactive ones.
- On click, calls `setCefrLevel(level)` via `useTransition`. Show a subtle
  loading state on the active button during the transition.
- Accessible: use a `<fieldset>` / `<legend>` + radio buttons visually styled
  as chips, or accessible button group with `aria-pressed`.

Import `GraduationCap` from `lucide-react` (already a project dependency).

### Step 13 — Edge cases

- **Sparse data guard (< 3 submissions)**: render a simple call-to-action
  `<div>` in place of the dashboard section — "Submit at least 3 writing tasks
  to unlock your progress dashboard." with a link to `/library`. The archive
  section below still renders normally.
- **All categories zero in trend window**: `TrendChart` shows an empty chart
  with axes and a "No errors in this period" message centred in the chart area
  (Recharts `<text>` element or an absolutely-positioned div).
- **`mostImprovedCategory === null`**: "Most Improved" stat card shows "—" and
  "Not enough data yet" as sub-label. No crash.
- **`getErrorTrend` returns empty**: `TrendChart` receives `data={[]}` and
  renders the empty state above.
- **`user_settings` row missing for `cefr_level`**: `getCefrLevel()` returns
  `null`; `CefrLevelPicker` renders all chips unselected (valid state for a
  new user who hasn't set a level yet).
- **Recharts SSR warning**: Recharts components must be client-only. Ensure
  every Recharts wrapper file has `"use client"` at the top. If the build
  outputs an SSR warning, add `ssr: false` via `dynamic()` — but with `"use
  client"` this should not be needed.

### Step 14 — Out of scope for S6 (defer)

- **"Practice →" button actually generating a task from Top-3 patterns** — S7.
  The button is wired to `/library` for now (Step 9 comment).
- **Learner profile injection into task generation** — S7.
- **SRS / spaced repetition queue** — v2.
- **PDF export of progress report** — v2.
- **Multi-user / auth** — v2.
- **Dark mode** — v2.

---

## 3. File-by-file Deliverables

| Path | Action |
|------|--------|
| `package.json` | **edit** — add `recharts` dependency |
| `src/lib/category-styles.ts` | **edit** — add `chartColor: string` to `CategoryStyle` and populate per category |
| `src/lib/db/schema.ts` | **edit** — add `userSettings` pgTable + `UserSetting` type |
| `drizzle/<timestamp>_user_settings.sql` | **new** (generated by `db:generate`) |
| `src/lib/actions/errors.ts` | **edit** — add `getDashboardStats()`, `getErrorTrend()`, `getTopRecurringPatterns()` |
| `src/lib/actions/settings.ts` | **edit** — add `getCefrLevel()`, `setCefrLevel()` |
| `src/app/progress/page.tsx` | **edit** — integrate dashboard layer above archive; wire `?window=` param; remove S6 placeholder text |
| `src/app/progress/_components/stat-cards.tsx` | **new** — four stat cards |
| `src/app/progress/_components/trend-chart.tsx` | **new** (client) — Recharts `LineChart` + window toggle |
| `src/app/progress/_components/distribution-chart.tsx` | **new** (client) — Recharts horizontal `BarChart` |
| `src/app/progress/_components/top-patterns.tsx` | **new** — Top-3 recurring subcategory patterns |
| `src/app/progress/_components/encouragement-banner.tsx` | **new** — positive footer message |
| `src/app/settings/page.tsx` | **edit** — add CEFR level section; call `getCefrLevel()` |
| `src/app/settings/_components/cefr-level-picker.tsx` | **new** (client) — chip-style CEFR level selector |

No changes to `errors`, `submissions`, `writing_tasks`, `documents`, `reading_sessions`,
`rules`, or `micro_drills` schema. The only DB delta is the new `user_settings` table.

---

## 4. Suggested Build Order

1. **Step 1 (install Recharts) + Step 2 (`chartColor` in `CATEGORY_STYLES`)**
   Unblocks all chart components. Verify `npm run build` still passes.

2. **Step 3 (DB: `user_settings`) + migration.**
   Verify in `db:studio`: table exists. No data yet.

3. **Step 4 (new queries in `errors.ts`) + Step 5 (`getCefrLevel` / `setCefrLevel`).**
   Pure backend. Smoke-test from a scratch script or `db:studio`:
   - `getDashboardStats()` returns sensible numbers with existing seed data.
   - `getErrorTrend(30)` returns an array (may be empty if no errors yet).
   - `getTopRecurringPatterns(3)` returns up to 3 rows.

4. **Step 6 (stat cards) + Step 9 (top patterns) + Step 10 (encouragement banner).**
   Server components with no interactivity — fast to build and easy to verify
   with a page render.

5. **Step 7 (trend chart) + Step 8 (distribution chart).**
   Client components — build with Recharts, verify visually in the browser
   that lines/bars render for existing seed data.

6. **Step 11 (rework `progress/page.tsx`).**
   Integrate everything. Test the full page with the sparse-data guard:
   comment out the `>= 3` check temporarily to verify the dashboard renders
   with real data.

7. **Step 12 (Settings CEFR level).**
   Build `CefrLevelPicker` and test the pick → persist → reload cycle.

8. **Step 13 (edge cases).**
   Verify: empty trend window, null most-improved, missing CEFR level.

9. **Self-check against PRD Sprint 6 checklist (§13.2)**:
   - [ ] Progress Dashboard page (4 cards + trend chart + distribution chart + Top 3 patterns)
   - [ ] Recharts integrated
   - [ ] 30/90/365-day window toggle wired via `?window=` URL param
   - [ ] Top-3 patterns panel (with "Practice →" placeholder)
   - [ ] Encouragement banner
   - [ ] Sparse-data guard (< 3 submissions → unlock message)
   - [ ] Settings: CEFR level manual picker persisted to `user_settings`
   - [ ] "Trends and charts arrive in S6" placeholder removed from progress page
   - [ ] Clicking distribution bar navigates to `/progress?category=<cat>` drill-down
