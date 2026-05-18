# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project overview

Lumière is an output-driven French learning app. The core loop: read French source material → AI generates a writing task anchored to it → user writes → AI gives structured, classified feedback → every error flows into a persistent learner profile that drives future tasks.

This is a personal app (single user, no auth). Current status: Sprint 3 complete (word lookup popover, reading session tracking, writing task generation, task stage + submit). Sprint 3.5 in progress (pre-S4 cleanup). Sprint 4 is next (writing feedback — structured AI output, error classification, feedback UI).

## Commands

```bash
npm run dev          # Start the dev server (http://localhost:3000)
npm run build        # Production build
npm run lint         # ESLint

npm run db:init      # Apply pending migrations (safe, idempotent) — run after any schema change
npm run db:generate  # Generate a new migration after editing src/lib/db/schema.ts
npm run db:studio    # Open Drizzle Studio at https://local.drizzle.studio
npm run db:seed      # Insert sample French documents
```

There is no test suite yet.

## Architecture

### Data flow

All DB access goes through **server actions** in `src/lib/actions/`. Pages are async server components that call these actions directly — there is no API layer. Mutations use `revalidatePath` to refresh after writes.

```
Page (async server component)
  └── lib/actions/*.ts  ("use server" — Drizzle queries, revalidatePath)
        └── lib/db/index.ts  (Drizzle client — node-postgres)
              └── lib/db/schema.ts  (single source of truth for all tables)
```

### Database

**PostgreSQL** via `node-postgres` + Drizzle ORM (migrated from SQLite in S3.5 — see PRD v0.1.1 changelog). Connect via `DATABASE_URL` env var. Six tables: `documents → reading_sessions`, `writing_tasks → submissions → errors`, and `rules`.

Drizzle schema uses `pgTable`, `jsonb` (for JSON arrays), and `timestamp`. All queries are **async** — use `await db.select()...`, `await db.insert()...` etc. Do **not** use `.run()` / `.get()` / `.all()` (those are SQLite-only).

### Error taxonomy

`src/lib/taxonomy.ts` is the most important non-schema file. It defines `ERROR_TAXONOMY` — 9 categories × ~4 subcategories = ~33 leaf error types for A2-B1 French learners. This is:
- The schema the AI must conform to when emitting structured feedback (enforced via Zod in S4)
- The index every dashboard and learner-profile decision references
- The source for `CATEGORY_COLORS` used in feedback highlights

Do not add categories without considering AI labelling accuracy and dashboard complexity.

### UI conventions

- **Fonts**: `font-sans` (Inter) for UI, `font-serif` (Source Serif 4) for reading content. Apply `font-serif` to document text and display headings.
- **Design tokens**: All colours are CSS custom properties defined in `globals.css` and exposed via Tailwind's `@theme inline`. Use semantic tokens (`text-muted-foreground`, `bg-surface`, `border-border`, `text-accent`) — never raw colour values.
- **Component style**: UI primitives live in `src/components/ui/` and are built with `cva` + `cn`. Follow the existing `Button` / `Chip` / `Card` pattern when adding new primitives.
- **Page-level components**: Co-locate sub-components under `_components/` inside the route folder (e.g. `app/library/_components/`).
- **Reading text**: Wrap document content in `<article className="reading-prose">` — the `.reading-prose` class in `globals.css` sets font, size, and line height.

### Coming sprints (don't implement prematurely)

- S4 (next): Writing feedback — structured AI output conforming to `ERROR_TAXONOMY`, persisted to `errors` table; `src/lib/ai/feedback-schema.ts` (Zod) added here; three-column feedback UI with inline highlights
- S5–S7: Errors archive, progress dashboard, learner profile

## Environment variables

```
OPENAI_API_KEY        # Required — word lookup, task generation, writing feedback
OPENAI_MODEL_LOOKUP   # defaults to gpt-4o-mini
OPENAI_MODEL_TASK     # defaults to gpt-4o
OPENAI_MODEL_FEEDBACK # defaults to gpt-4o
DATABASE_URL          # Required — PostgreSQL connection string (e.g. postgres://user:pass@host/db)
```
