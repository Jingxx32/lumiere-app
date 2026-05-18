import { pgEnum, pgTable, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/*  Enums                                                               */
/* ------------------------------------------------------------------ */

export const documentTypeEnum = pgEnum("document_type", [
  "news",
  "literature",
  "personal",
  "other",
]);

/* ------------------------------------------------------------------ */
/*  documents — your library of French source material                 */
/* ------------------------------------------------------------------ */

export const documents = pgTable("documents", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  source: text("source"),
  sourceUrl: text("source_url"),
  type: documentTypeEnum("type").notNull().default("other"),
  /** Raw French text. Paragraph breaks preserved with \n\n. */
  content: text("content").notNull(),
  language: text("language").notNull().default("fr"),
  estimatedLevel: text("estimated_level"),
  wordCount: integer("word_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastReadAt: timestamp("last_read_at"),
  /** 0 - 100, updated by Document Reader as user scrolls. */
  readingProgress: integer("reading_progress").notNull().default(0),
});

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;

/* ------------------------------------------------------------------ */
/*  reading_sessions — captures vocab looked up while reading a doc    */
/* ------------------------------------------------------------------ */

export const readingSessions = pgTable("reading_sessions", {
  id: text("id").primaryKey(),
  documentId: text("document_id").references(() => documents.id, {
    onDelete: "set null",
  }),
  /** Snapshot of the document title at session creation time — preserved after document deletion. */
  documentTitleSnapshot: text("document_title_snapshot"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  endedAt: timestamp("ended_at"),
  durationSeconds: integer("duration_seconds").notNull().default(0),
  /** JSON array of { word, surface, lookedUpAt, position } */
  vocabularyLookedUp: jsonb("vocabulary_looked_up"),
});

export type ReadingSession = typeof readingSessions.$inferSelect;

/* ------------------------------------------------------------------ */
/*  writing_tasks — AI-generated prompts anchored to a document        */
/* ------------------------------------------------------------------ */

export const writingTasks = pgTable("writing_tasks", {
  id: text("id").primaryKey(),
  documentId: text("document_id").references(() => documents.id, {
    onDelete: "set null",
  }),
  promptEn: text("prompt_en").notNull(),
  /** JSON string[] — vocab the user must use */
  targetWords: jsonb("target_words").notNull(),
  /** JSON string[] — taxonomy subcategory ids the task targets */
  targetGrammar: jsonb("target_grammar").notNull(),
  difficulty: text("difficulty"),
  minWordCount: integer("min_word_count").notNull().default(50),
  maxWordCount: integer("max_word_count").notNull().default(200),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type WritingTask = typeof writingTasks.$inferSelect;

/* ------------------------------------------------------------------ */
/*  submissions — what the user wrote in response to a task            */
/* ------------------------------------------------------------------ */

export const submissions = pgTable("submissions", {
  id: text("id").primaryKey(),
  taskId: text("task_id")
    .notNull()
    .references(() => writingTasks.id, { onDelete: "cascade" }),
  contentFr: text("content_fr").notNull(),
  wordCount: integer("word_count").notNull().default(0),
  submittedAt: timestamp("submitted_at").notNull().defaultNow(),
  /** Raw AI feedback packet for replay/debug — stored as JSON. */
  feedbackJson: jsonb("feedback_json"),
  estimatedLevel: text("estimated_level"),
  /** JSON string[] of praise sentences shown in the Praise card */
  praise: jsonb("praise"),
  summaryEn: text("summary_en"),
});

export type Submission = typeof submissions.$inferSelect;

/* ------------------------------------------------------------------ */
/*  errors — THE SOUL TABLE — every classified error from the AI       */
/* ------------------------------------------------------------------ */

export const errors = pgTable("errors", {
  id: text("id").primaryKey(),
  submissionId: text("submission_id")
    .notNull()
    .references(() => submissions.id, { onDelete: "cascade" }),
  spanStart: integer("span_start").notNull(),
  spanEnd: integer("span_end").notNull(),
  original: text("original").notNull(),
  correction: text("correction").notNull(),
  /** Top-level taxonomy key, e.g. "Grammar" */
  category: text("category").notNull(),
  /** Leaf taxonomy key, e.g. "tense_choice" */
  subcategory: text("subcategory").notNull(),
  triggerContext: text("trigger_context"),
  explanationEn: text("explanation_en").notNull(),
  /** JSON string[] of 2-3 French example sentences */
  frExamples: jsonb("fr_examples"),
  ruleId: text("rule_id"),
  microDrill: text("micro_drill"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ErrorRecord = typeof errors.$inferSelect;

/* ------------------------------------------------------------------ */
/*  rules — knowledge base of grammar rules (referenced by errors)     */
/* ------------------------------------------------------------------ */

export const rules = pgTable("rules", {
  id: text("id").primaryKey(),
  category: text("category").notNull(),
  subcategory: text("subcategory").notNull(),
  name: text("name").notNull(),
  descriptionEn: text("description_en").notNull(),
  /** JSON string[] of canonical example sentences */
  examples: jsonb("examples"),
});

export type Rule = typeof rules.$inferSelect;

/* ------------------------------------------------------------------ */
/*  micro_drills — practice attempts triggered from error cards        */
/* ------------------------------------------------------------------ */

export const microDrills = pgTable("micro_drills", {
  id: text("id").primaryKey(),
  errorId: text("error_id")
    .notNull()
    .references(() => errors.id, { onDelete: "cascade" }),
  /** The drill prompt shown to the user — snapshotted from errors.microDrill at creation time. */
  promptText: text("prompt_text").notNull(),
  /** The user's 2-sentence French response. NFC-normalised before insert. */
  responseFr: text("response_fr").notNull(),
  /** Light AI feedback packet — see MicroDrillFeedbackSchema. */
  feedbackJson: jsonb("feedback_json"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type MicroDrill = typeof microDrills.$inferSelect;

/* ------------------------------------------------------------------ */
/*  user_settings — key/value store for per-user preferences           */
/* ------------------------------------------------------------------ */

export const userSettings = pgTable("user_settings", {
  /** Stable key, e.g. "cefr_level" */
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type UserSetting = typeof userSettings.$inferSelect;
