# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project overview

Lumière is an output-driven French learning app. The core loop: read French source material → AI generates a writing task anchored to it → user writes → AI gives structured, classified feedback → every error flows into a persistent learner profile that drives future tasks.

This is a personal app (single user, no auth). Current status: **MVP (S1–S7) and v0.2 (S8–S10) are shipped** — full writing-feedback loop, errors archive, progress dashboard, learner profile, generic quiz engine (podcast cloze dictation), conjugation drills, TCF listening/reading question bank (~3200 questions) with drill + exam modes, lemma-keyed vocabulary memory, and Speaking Phase 1 (read-aloud with Azure pronunciation assessment; needs `AZURE_SPEECH_KEY`). Next up: the TCF error loop — see `docs/superpowers/specs/2026-07-06-tcf-error-loop-design.md`. Audits live in `docs/audit-*.md` / `docs/*-audit-*.md`.

## Commands

```bash
npm run dev          # Start the dev server (http://localhost:3000)
npm run build        # Production build
npm run lint         # ESLint

npm run db:init      # Apply pending migrations (safe, idempotent) — run after any schema change
npm run db:generate  # Generate a new migration after editing src/lib/db/schema.ts
npm run db:studio    # Open Drizzle Studio at https://local.drizzle.studio
npm run db:seed      # Insert sample French documents
npm run db:seed-rules # Seed the grammar-rules knowledge base
npm run db:reenrich  # Re-run vocab enrichment for already-enriched entries
```

TCF import/TTS pipeline scripts also live in `scripts/` (tracked; their input
data and `scripts/.tcf-cache/` stay local — copyrighted exam content).

There is no test suite yet.

## Architecture

### Data flow

All DB access goes through **server actions** in `src/lib/actions/`. Pages are async server components that call these actions directly — there is no API layer. Mutations use `revalidatePath` to refresh after writes.

```
Page (async server component)
  └── lib/actions/*.ts  ("use server" — Drizzle queries, revalidatePath)
        └── lib/db/index.ts  (Drizzle client — postgres.js)
              └── lib/db/schema.ts  (single source of truth for all tables)
```

The one exception to "no API layer": `app/api/speaking/assess/route.ts`, a route
handler for audio upload + Azure pronunciation assessment.

### Database

**PostgreSQL** (Azure) via the `postgres` package (postgres.js) + Drizzle ORM (migrated from SQLite in S3.5). Connect via `DATABASE_URL` env var. ~23 tables in five groups:

- Core loop: `documents → reading_sessions`, `writing_tasks → submissions → errors`, `rules`, `micro_drills`
- Vocabulary memory: `vocabulary_lookups` (lemma-keyed) + `vocabulary_aliases` + `vocabulary_occurrences`
- Quiz engine (PRD v0.2 D-0): `quiz_sets → quiz_passages → quiz_questions`, `quiz_attempts`, `conjugation_attempts`
- TCF: `tcf_sets → tcf_questions`, `tcf_attempts` (whole-exam runs)
- Speaking: `speaking_prompts → speaking_scripts / speaking_sessions → speaking_turns`; plus `user_settings` (KV)

Conventions: older tables use `text` PKs + app-side `randomUUID()` and naive `timestamp`; **new tables use `uuid` PK `defaultRandom()` + `timestamp(..., { withTimezone: true })`**. All queries are **async** — use `await db.select()...` etc. Do **not** use `.run()` / `.get()` / `.all()` (SQLite-only).

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

### Planned work (don't implement prematurely)

Specs and plans live under `docs/superpowers/{specs,plans}/`; product direction in `docs/audit-*.md`. Current queue: TCF error loop steps 2–4 (AI skill-tagging, smart re-drill queue, weak-points panel + exam review page), lightweight review queue (Leitner), TCF EE writing mode (gated on writing habit recovery).

## Environment variables

```
OPENAI_API_KEY        # Required — word lookup, task generation, writing feedback
OPENAI_MODEL_LOOKUP   # defaults to gpt-4o-mini
OPENAI_MODEL_TASK     # defaults to gpt-4o
OPENAI_MODEL_FEEDBACK # defaults to gpt-4o
OPENAI_MODEL_ENRICH   # vocab enrich; defaults to gpt-4o-mini
DATABASE_URL          # Required — PostgreSQL connection string (e.g. postgres://user:pass@host/db)
AZURE_SPEECH_KEY      # Speaking only — Azure Cognitive Services Speech key
AZURE_SPEECH_REGION   # Speaking only — e.g. canadacentral
TCF_LISTENING_DIR     # TCF import only — local folder of listening PDFs + audio
TCF_READING_DIR       # TCF import only — local folder of reading questions
TCF_SAMPLE_PDF        # TCF parser debug scripts only — one local PDF
```
