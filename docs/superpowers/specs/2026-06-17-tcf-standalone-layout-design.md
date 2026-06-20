# TCF Standalone Layout — Design Spec

**Date:** 2026-06-17
**Status:** Approved

## Summary

Extract the `/tcf/*` routes from the shared Lumière shell (Sidebar + main) into their own layout with a TCF-specific top header. The main app routes gain a `(main)` route group to keep their sidebar. Visual language stays Lumière (same design tokens, fonts, components). No changes to TCF data, logic, or drill/exam behaviour.

---

## Architecture

### Route Structure (after)

```
src/app/
  layout.tsx          ← Slimmed down: only <html><body> + fonts + globals.css. No Sidebar.
  page.tsx            ← Unchanged. redirect("/library"). No shell needed.
  globals.css         ← Unchanged.

  (main)/
    layout.tsx        ← NEW. Renders <Sidebar /> + <main>{children}</main> shell.
    library/          ← mv from app/library  (URL unchanged: /library)
    practice/         ← mv from app/practice
    quiz/             ← mv from app/quiz
    conjugation/      ← mv from app/conjugation
    progress/         ← mv from app/progress
    settings/         ← mv from app/settings
    documents/        ← mv from app/documents

  tcf/
    layout.tsx        ← NEW. Renders <TcfHeader /> + content container.
    page.tsx          ← Minor trim: remove skill-toggle section (moved to header).
    drill/
    exam/
    _components/
      tcf-header.tsx  ← NEW. Client component.
```

Route groups (`(main)`) are transparent to Next.js routing — URLs are unchanged.

### Layout Hierarchy

```
Root layout (html/body/fonts)
  ├── (main)/layout  →  Sidebar + main
  │     └── all existing pages
  └── tcf/layout     →  TcfHeader + content container
        └── /tcf, /tcf/drill, /tcf/exam
```

---

## TCF Header Component (`tcf-header.tsx`)

**Type:** Client component (`"use client"`) — needs `usePathname` + `useSearchParams`.

**Layout:** Single horizontal bar, full-width.

- **Left:** Lumière sparkle icon + "TCF Canada" serif heading.
- **Center:** `Lecture / Écoute` toggle chips (same style as current `/tcf` page toggle, moved up to header). Active state driven by `?skill` search param. Clicking always navigates to `/tcf?skill=reading|listening`.
- **Right:** `← Lumière` link → `/library`.

**Suspense:** `tcf/layout.tsx` wraps `<TcfHeader />` in `<Suspense>` because `useSearchParams` requires it in Next.js 16.

---

## Page Changes

### `src/app/tcf/page.tsx`
- Remove the skill-toggle `<div>` block (lines 53–69 of current file). The toggle now lives in the header.
- Keep all content below: level heading, level cards grid, exam section.
- Remove the outer `px-10 py-10 max-w-5xl mx-auto` wrapper div — the layout provides this container.

### `src/app/tcf/layout.tsx` (new)
```
TcfHeader (in Suspense)
<div className="px-10 py-10 max-w-5xl mx-auto">
  {children}
</div>
```

---

## Visual Language

Unchanged from the rest of Lumière:
- Fonts: `font-sans` (Inter) for UI, `font-serif` (Source Serif 4) for headings.
- Colors: semantic tokens only (`text-accent`, `bg-surface`, `border-border`, etc.).
- Header bar: `border-b border-border/60 bg-background px-6 py-3` — minimal, consistent with the page aesthetic.

---

## Scope Boundary

**In scope:**
- Root layout slimming.
- `(main)` route group + layout (sidebar shell).
- `tcf/layout.tsx` (TCF shell).
- `tcf/_components/tcf-header.tsx`.
- Minor trim of `tcf/page.tsx` (remove skill toggle).

**Out of scope:**
- `src/lib/actions/tcf.ts` — no changes.
- `src/lib/tcf/*` — no changes.
- `tcf/_components/drill-runner.tsx`, `exam-runner.tsx`, `level-nav.tsx` — no changes.
- DB schema, migrations, seed scripts — no changes.

---

## Verification Criteria

- `/library`, `/practice`, `/quiz`, `/conjugation`, `/progress`, `/settings`, `/documents/*` — all still show left Sidebar, no visual regression.
- `/tcf` — shows TCF header (no Sidebar), skill toggle in header, level cards and exam grid below.
- `/tcf/drill?skill=...&level=...` — shows TCF header, no Sidebar.
- `/tcf/exam?skill=...&test=...` — shows TCF header, no Sidebar.
- `← Lumière` in header returns to `/library`.
- Skill toggle in header switches `?skill` param and updates active chip.
- `npm run build` passes with no errors or type errors.
