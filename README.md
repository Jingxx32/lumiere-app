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

## Status — v0.1 (Sprint 1 complete)

| Sprint | Scope | Status |
|--------|-------|--------|
| **S1** | Scaffold, DB schema, Library, Document Reader (basic) | ✅ |
| S2 | Click-to-define vocabulary lookup (OpenAI) | next |
| S3 | "Generate Writing Task" anchored to a document | |
| S4 | **★ Writing feedback ★** structured + persisted | |
| S5 | Errors archive view | |
| S6 | Progress dashboard with trend charts | |
| S7 | Learner profile drives task generation | |

## Quick start

```bash
# 1. install
npm install

# 2. initialise the local SQLite database
npm run db:init

# 3. (optional) seed three sample French texts
npm run db:seed

# 4. add your OpenAI key when you reach S2
cp .env.example .env
# then edit .env and put your real OPENAI_API_KEY

# 5. run the dev server
npm run dev
```

Open <http://localhost:3000> — you'll be redirected to **Library**.

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript |
| Styling | Tailwind CSS v4 + custom warm-beige + french-blue design tokens |
| Database | SQLite via `better-sqlite3`, accessed through Drizzle ORM |
| AI | OpenAI API (added in S2+) — structured outputs with Zod schemas |
| UI primitives | Radix UI (Dialog, Popover, Slot) — minimal, owned components |
| Icons | Lucide |
| Fonts | Inter (UI) + Source Serif 4 (reading + display) |

## Project layout

```
src/
├── app/
│   ├── layout.tsx              # Root layout + Sidebar
│   ├── page.tsx                # → redirects to /library
│   ├── library/                # The library page
│   │   ├── page.tsx
│   │   └── _components/
│   ├── documents/[id]/         # Document Reader
│   ├── practice/               # Coming in S3
│   ├── progress/               # Coming in S6
│   └── settings/
├── components/
│   ├── sidebar.tsx
│   └── ui/                     # Button, Card, Dialog, Chip, Input...
└── lib/
    ├── db/
    │   ├── schema.ts           # All 6 tables (documents → errors)
    │   └── index.ts            # Drizzle client
    ├── actions/
    │   └── documents.ts        # Server actions for documents
    ├── taxonomy.ts             # ★ Error taxonomy (the soul) ★
    ├── cefr.ts                 # CEFR utilities
    └── utils.ts                # cn() helper

drizzle/                        # Generated migration SQL
scripts/
├── db-init.ts                  # Apply migrations
└── seed.ts                     # Insert sample French texts
data/                           # SQLite file (gitignored)
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
