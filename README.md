# Lumière

> **Read French. Write French. See your blind spots fade.**
>
> A personal training ground for output-driven French learning.

Lumière is built around one belief: **language sticks when you produce it, not when you consume it**. Tools like NotebookLM are great at making French *easier to understand* — but in doing so they remove the very friction that drives real acquisition. Lumière flips that around.

The core loop:

```
Read your own French material
        ↓
AI generates a writing task anchored to what you just read
        ↓
You write
        ↓
AI gives structured, classified feedback (in English, with French examples)
        ↓
Every error flows into your persistent learner profile
        ↓
Your trends and weak spots feed the next task
```

## Status — v0.2 + Speaking Phase 1

| Phase | Scope | Status |
|-------|-------|--------|
| **MVP S1–S7** | Library + Reader, click-to-define lookup, writing tasks, **structured writing feedback**, errors archive, progress dashboard, learner profile | ✅ |
| **v0.2 S8–S10** | Generic quiz engine, podcast cloze dictation (Whisper word timestamps), conjugation drills (LEFFF, deterministic), TCF listening/reading bank (~3200 questions, drill + exam) | ✅ |
| **Speaking P1** | TCF Expression orale read-aloud + Azure pronunciation assessment (needs `AZURE_SPEECH_KEY`) | ✅ merged |
| Next | TCF error loop (per-question attempts → smart re-drill → skill-tag profile), `/today` daily plan | in progress |

## Quick start

```bash
# 1. install
npm install

# 2. point DATABASE_URL at a PostgreSQL database and apply migrations
#    .env needs: DATABASE_URL, OPENAI_API_KEY (and AZURE_SPEECH_KEY/REGION for speaking)
npm run db:init

# 3. (optional) seed sample French texts + grammar rules
npm run db:seed
npm run db:seed-rules

# 5. run the dev server
npm run dev
```

Open <http://localhost:3000> — you'll be redirected to **Library**.

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript |
| Styling | Tailwind CSS v4 + custom warm-beige + french-blue design tokens |
| Database | PostgreSQL (Azure) via `postgres` (postgres.js) + Drizzle ORM |
| AI | OpenAI API (GPT-4o/4o-mini, Whisper) — structured outputs with Zod; Azure Speech for pronunciation |
| UI primitives | Radix UI (Dialog, Popover, Slot) — minimal, owned components |
| Icons | Lucide |
| Fonts | Inter (UI) + Source Serif 4 (reading + display) |

## Project layout

```
src/
├── app/
│   ├── (main)/                 # Sidebar shell: library, documents, practice,
│   │                           #   quiz, vocabulary, conjugation, speaking,
│   │                           #   progress, settings
│   ├── tcf/                    # Standalone TCF layout: drill + exam
│   ├── api/speaking/assess/    # Audio upload → Azure pronunciation assessment
│   └── page.tsx                # → redirects to the default home
├── components/                 # Sidebar, lookup popover, ui/ primitives
├── hooks/
└── lib/
    ├── db/schema.ts            # ~23 tables, single source of truth
    ├── actions/                # ALL db access (server actions, no API layer)
    ├── ai/                     # OpenAI wrappers (lookup, feedback, task, …)
    ├── speech/azure.ts         # Azure pronunciation assessment
    ├── taxonomy.ts             # ★ Error taxonomy (the soul) ★
    └── tcf/, vocabulary/, conjugation/, pdf/ …

drizzle/                        # Generated migration SQL
scripts/                        # db-init/seed + TCF import & TTS pipeline
docs/                           # PRDs, audits, superpowers/{specs,plans}
```

## The error taxonomy

The single most important design decision in Lumière is the
[`ERROR_TAXONOMY`](src/lib/taxonomy.ts) — a flat-but-categorised set of ~33
error subcategories tuned for **A2-B1 learners**. It is:

1. The schema the AI must conform to when emitting structured feedback
2. The index used by every dashboard, drill, and learner-profile decision
3. Deliberately weighted toward foundational issues (tense, gender, articles)
   over stylistic ones (register, idiom)

If you change levels later (e.g. become B2+), this is the file to revisit.

## Database scripts

```bash
npm run db:init       # Apply pending migrations (safe, idempotent)
npm run db:generate   # Generate a new migration after schema change
npm run db:studio     # Open Drizzle Studio at https://local.drizzle.studio
npm run db:seed       # Insert sample French documents
```

## License

Personal project. Not yet open to external contributors.
