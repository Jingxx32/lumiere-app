# TCF Standalone Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract `/tcf/*` routes from the shared Lumière shell into their own layout with a TCF-specific top header, using a Next.js route group to isolate the two shells.

**Architecture:** Slim the root layout to bare `<html>/<body>`, add a `(main)` route group that owns the Sidebar shell for all existing pages, and add a `tcf/layout.tsx` that renders a TCF-specific header + content container. The `(main)` route group is URL-transparent — `/library` stays `/library`.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS, lucide-react. No new dependencies.

## Global Constraints

- Design tokens only — no raw hex/rgb values; use `text-accent`, `bg-surface`, `border-border`, etc.
- Fonts: `font-sans` (Inter) for UI, `font-serif` (Source Serif 4) for headings.
- No changes to DB, actions, or TCF drill/exam logic.
- `useSearchParams` in client components always requires a `<Suspense>` boundary in Next.js 16.
- Route group folder name uses literal parentheses: `(main)`. Shell-escape with quotes when using bash.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/app/layout.tsx` | Remove Sidebar; keep fonts, metadata, globals.css |
| Create | `src/app/(main)/layout.tsx` | Renders `<Sidebar /> + <main>` shell |
| Move   | `src/app/library/` → `src/app/(main)/library/` | No logic change |
| Move   | `src/app/practice/` → `src/app/(main)/practice/` | No logic change |
| Move   | `src/app/quiz/` → `src/app/(main)/quiz/` | No logic change |
| Move   | `src/app/conjugation/` → `src/app/(main)/conjugation/` | No logic change |
| Move   | `src/app/progress/` → `src/app/(main)/progress/` | No logic change |
| Move   | `src/app/settings/` → `src/app/(main)/settings/` | No logic change |
| Move   | `src/app/documents/` → `src/app/(main)/documents/` | No logic change |
| Create | `src/app/tcf/_components/tcf-header.tsx` | Client component: title, skill toggle, return link |
| Create | `src/app/tcf/layout.tsx` | TCF shell: `<TcfHeader>` in Suspense + content container |
| Modify | `src/app/tcf/page.tsx` | Remove outer container div + remove skill toggle block |

---

### Task 1: Route group scaffold + root layout slim

**Files:**
- Modify: `src/app/layout.tsx`
- Create: `src/app/(main)/layout.tsx`
- Move: 7 route folders into `src/app/(main)/`

**Interfaces:**
- Produces: `(main)/layout.tsx` exports `MainLayout` — wraps children in `<div className="flex min-h-screen"><Sidebar /><main className="flex-1 min-w-0">{children}</main></div>`

These three changes must land in the same commit — doing them separately would leave the app without a sidebar.

- [ ] **Step 1: Create the `(main)` folder and its layout**

```bash
mkdir -p "src/app/(main)"
```

Create `src/app/(main)/layout.tsx`:

```tsx
import { Sidebar } from "@/components/sidebar";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Move the 7 route folders into `(main)/`**

```bash
git mv src/app/library    "src/app/(main)/library"
git mv src/app/practice   "src/app/(main)/practice"
git mv src/app/quiz       "src/app/(main)/quiz"
git mv src/app/conjugation "src/app/(main)/conjugation"
git mv src/app/progress   "src/app/(main)/progress"
git mv src/app/settings   "src/app/(main)/settings"
git mv src/app/documents  "src/app/(main)/documents"
```

- [ ] **Step 3: Slim the root layout**

Replace `src/app/layout.tsx` with the version below. The only change is removing the `Sidebar` import and stripping the `flex` wrapper — the shell is now in `(main)/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Lumière — French learning, output-first",
  description:
    "Read French, write French, see your blind spots fade. A personal training ground for output-driven French learning.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${sourceSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Verify main routes still work**

```bash
npm run dev
```

Open `http://localhost:3000/library` — Sidebar must be present.
Open `http://localhost:3000/tcf` — Sidebar must be absent (no TCF layout yet — page renders bare for now).
Check browser console for errors.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(main)/layout.tsx" src/app/layout.tsx
git commit -m "refactor: extract (main) route group with sidebar shell, slim root layout"
```

---

### Task 2: TCF header client component

**Files:**
- Create: `src/app/tcf/_components/tcf-header.tsx`

**Interfaces:**
- Consumes: `useSearchParams` from `next/navigation`, `cn` from `@/lib/utils`, `Sparkles` from `lucide-react`
- Produces: `TcfHeader` — default-named export, no props

- [ ] **Step 1: Create `tcf-header.tsx`**

Create `src/app/tcf/_components/tcf-header.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export function TcfHeader() {
  const searchParams = useSearchParams();
  const skill = searchParams.get("skill") === "reading" ? "reading" : "listening";

  return (
    <header className="flex items-center justify-between border-b border-border/60 bg-background px-6 py-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-accent" strokeWidth={1.8} />
        <span className="font-serif text-lg font-semibold tracking-tight">
          TCF Canada
        </span>
      </div>

      <div className="inline-flex rounded-lg border border-border/70 bg-surface p-0.5">
        {(["listening", "reading"] as const).map((s) => (
          <Link
            key={s}
            href={`/tcf?skill=${s}`}
            className={cn(
              "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
              s === skill
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {s === "listening" ? "Écoute" : "Lecture"}
          </Link>
        ))}
      </div>

      <Link
        href="/library"
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        ← Lumière
      </Link>
    </header>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/tcf/_components/tcf-header.tsx
git commit -m "feat: add TcfHeader client component"
```

---

### Task 3: TCF layout

**Files:**
- Create: `src/app/tcf/layout.tsx`

**Interfaces:**
- Consumes: `TcfHeader` from `./\_components/tcf-header`
- Produces: `TcfLayout` — wraps TCF children in header + content container

- [ ] **Step 1: Create `tcf/layout.tsx`**

Create `src/app/tcf/layout.tsx`:

```tsx
import { Suspense } from "react";
import { TcfHeader } from "./_components/tcf-header";

export default function TcfLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Suspense fallback={<div className="h-[53px] border-b border-border/60" />}>
        <TcfHeader />
      </Suspense>
      <div className="w-full max-w-5xl mx-auto px-10 py-10">
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TCF routes use the new shell**

With dev server running, open `http://localhost:3000/tcf`:
- No Sidebar visible.
- TCF header bar at top: `[✦ TCF Canada]` left, `[Écoute][Lecture]` toggle center, `← Lumière` right.
- Clicking `← Lumière` navigates to `/library` with Sidebar.
- Clicking `Écoute` / `Lecture` toggles the active chip.

- [ ] **Step 3: Commit**

```bash
git add src/app/tcf/layout.tsx
git commit -m "feat: add TCF standalone layout with TcfHeader"
```

---

### Task 4: Trim `tcf/page.tsx`

**Files:**
- Modify: `src/app/tcf/page.tsx`

The page currently has two things the layout now provides:
1. Outer container div (`px-10 py-10 max-w-5xl mx-auto`) — replaced by `tcf/layout.tsx`
2. Skill toggle block (lines 53–69) — replaced by `TcfHeader`

**Interfaces:**
- Consumes: `searchParams.skill` — still used to set `meta` / `Icon` for the page heading and level sub-heading.

- [ ] **Step 1: Edit `tcf/page.tsx`**

Replace the entire `return (...)` block. The diff:
- Remove the outer `<div className="px-10 py-10 max-w-5xl mx-auto">` wrapper (use `<>` fragment instead).
- Remove the `{/* Skill toggle */}` block (lines 53–69).
- Everything else stays verbatim.

New return block:

```tsx
  return (
    <>
      <div className="flex items-end gap-3 mb-2">
        <Icon className="h-8 w-8 text-accent mb-0.5" strokeWidth={1.6} />
        <h1 className="font-serif text-4xl font-semibold tracking-tight">TCF Canada</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-6">{meta.title} — par niveau CECR</p>

      <h2 className="text-xs uppercase tracking-widest text-subtle-foreground font-medium mb-4">
        {meta.levelVerb} · Choisissez un niveau
      </h2>

      {summaries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface/50 px-8 py-16 text-center">
          <p className="font-serif text-xl text-foreground">Aucune question disponible.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Importez les exercices pour commencer.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {summaries.map((s) => {
            const colors = LEVEL_COLORS[s.level];
            return (
              <Link
                key={s.level}
                href={`/tcf/drill?skill=${skill}&level=${s.level}`}
                className="group block"
              >
                <Card
                  className={`px-6 py-5 transition-all group-hover:shadow-sm group-hover:border-accent/40 ${
                    s.total === 0 ? "opacity-50 pointer-events-none" : ""
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <span
                      className={`inline-block rounded-md px-2 py-0.5 text-sm font-bold font-mono ${colors.bg} ${colors.text}`}
                    >
                      {s.level}
                    </span>
                    {s.total > 0 && (
                      <span className="text-[11px] text-subtle-foreground">{s.total} q.</span>
                    )}
                  </div>
                  <p className="font-serif text-base font-semibold text-foreground leading-tight">
                    {LEVEL_LABELS[s.level]}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {s.total === 0
                      ? "Pas encore disponible"
                      : `${s.sets} test${s.sets > 1 ? "s" : ""}`}
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {sets.length > 0 && (
        <>
          <h2 className="mt-12 text-xs uppercase tracking-widest text-subtle-foreground font-medium mb-4">
            Examen blanc · Choisissez un test
          </h2>
          <p className="text-sm text-muted-foreground mb-4 -mt-2">
            Un test complet de 39 questions (A1 → C2), avec score à la fin.
          </p>
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
            {sets.map((s) => (
              <Link
                key={s.id}
                href={`/tcf/exam?skill=${skill}&test=${s.testNumber}`}
                className="group flex flex-col items-center justify-center rounded-xl border border-border/70 bg-surface px-2 py-3 transition-all hover:border-accent/40 hover:shadow-sm"
              >
                <span className="font-serif text-lg font-semibold text-foreground group-hover:text-accent">
                  {s.testNumber}
                </span>
                <span className="text-[10px] text-subtle-foreground">{s.totalCount} q.</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
```

Also remove the now-unused `cn` import if it was only used by the skill toggle. Check the top of the file — if `cn` appears nowhere else in the file, remove its import.

- [ ] **Step 2: Final verification**

```bash
npm run build
```

Expected: exits 0 with no TypeScript errors.

Then with dev server:
- `/tcf` — header visible, no duplicate skill toggle in page body, level cards render.
- `/tcf?skill=reading` — "Lecture" chip active in header, page shows "Compréhension écrite" subtitle.
- `/tcf/drill?skill=listening&level=B1` — header visible, drill works as before.
- `/tcf/exam?skill=reading&test=1` — header visible, exam works as before.
- `/library` — Sidebar still present, no regression.
- `/practice`, `/quiz`, `/progress`, `/settings` — all still have Sidebar.

- [ ] **Step 3: Commit**

```bash
git add src/app/tcf/page.tsx
git commit -m "feat: remove skill toggle from tcf page (moved to TcfHeader)"
```
