"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  tcfSets,
  tcfQuestions,
  tcfAttempts,
  tcfQuestionAttempts,
  tcfLevelEnum,
} from "@/lib/db/schema";
import type { TcfPerLevel, TcfAttempt } from "@/lib/db/schema";
import { eq, and, asc, desc } from "drizzle-orm";

export type TcfLevel = (typeof tcfLevelEnum.enumValues)[number];

export interface TcfSetWithCounts {
  id: string;
  testNumber: number;
  skill: "listening" | "reading";
  title: string;
  source: string | null;
  levelCounts: Record<TcfLevel, number>;
  totalCount: number;
}

export async function listTcfSets(skill: "listening" | "reading" = "listening"): Promise<TcfSetWithCounts[]> {
  const sets = await db
    .select()
    .from(tcfSets)
    .where(eq(tcfSets.skill, skill))
    .orderBy(asc(tcfSets.testNumber));

  if (sets.length === 0) return [];

  const allQuestions = await db
    .select({ setId: tcfQuestions.setId, level: tcfQuestions.level })
    .from(tcfQuestions)
    .innerJoin(tcfSets, eq(tcfQuestions.setId, tcfSets.id))
    .where(eq(tcfSets.skill, skill));

  const countsBySet: Record<string, Record<TcfLevel, number>> = {};
  for (const q of allQuestions) {
    if (!countsBySet[q.setId]) {
      countsBySet[q.setId] = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0 };
    }
    countsBySet[q.setId][q.level as TcfLevel]++;
  }

  return sets.map((s) => {
    const lc = countsBySet[s.id] ?? { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0 };
    return {
      id: s.id,
      testNumber: s.testNumber,
      skill: s.skill,
      title: s.title,
      source: s.source,
      levelCounts: lc,
      totalCount: Object.values(lc).reduce((a, b) => a + b, 0),
    };
  });
}

export interface TcfLevelSummary {
  level: TcfLevel;
  total: number;
  sets: number;
}

/** Aggregate across all sets for the overview cards */
export async function getTcfLevelSummaries(skill: "listening" | "reading" = "listening"): Promise<TcfLevelSummary[]> {
  const sets = await db.select({ id: tcfSets.id }).from(tcfSets).where(eq(tcfSets.skill, skill));
  if (sets.length === 0) return [];

  const questions = await db
    .select({ level: tcfQuestions.level })
    .from(tcfQuestions)
    .innerJoin(tcfSets, eq(tcfQuestions.setId, tcfSets.id))
    .where(eq(tcfSets.skill, skill));

  const counts: Record<TcfLevel, number> = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0 };
  for (const q of questions) {
    counts[q.level as TcfLevel]++;
  }

  const LEVELS: TcfLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];
  return LEVELS.map((level) => ({ level, total: counts[level], sets: sets.length }));
}

export interface TcfQuestionForDrill {
  id: string;
  setId: string;
  testNumber: number;
  orderIndex: number;
  level: TcfLevel;
  type: "image" | "spoken_options" | "dialogue" | "reading_mcq";
  questionText: string;
  options: string[];
  answer: number;
  transcript: string | null;
  passage: string | null;
  explanation: string | null;
  imagePath: string | null;
  audioPath: string | null;
}

/** All questions of one test set, in exam order (1–39) */
export async function getTcfSetQuestions(
  skill: "listening" | "reading",
  testNumber: number,
): Promise<TcfQuestionForDrill[]> {
  const rows = await db
    .select({
      id: tcfQuestions.id,
      setId: tcfQuestions.setId,
      testNumber: tcfSets.testNumber,
      orderIndex: tcfQuestions.orderIndex,
      level: tcfQuestions.level,
      type: tcfQuestions.type,
      questionText: tcfQuestions.questionText,
      options: tcfQuestions.options,
      answer: tcfQuestions.answer,
      transcript: tcfQuestions.transcript,
      passage: tcfQuestions.passage,
      explanation: tcfQuestions.explanation,
      imagePath: tcfQuestions.imagePath,
      audioPath: tcfQuestions.audioPath,
    })
    .from(tcfQuestions)
    .innerJoin(tcfSets, eq(tcfQuestions.setId, tcfSets.id))
    .where(and(eq(tcfSets.skill, skill), eq(tcfSets.testNumber, testNumber)))
    .orderBy(asc(tcfQuestions.orderIndex));

  return rows.map((r) => ({
    ...r,
    level: r.level as TcfLevel,
    type: r.type as TcfQuestionForDrill["type"],
    options: r.options as string[],
    answer: r.answer,
  }));
}

/** Resolve a question's skill + level from its id, so a bare `?q=<id>` deep link
 *  can open the correct drill group instead of falling back to listening/A2. */
export async function getTcfQuestionById(
  id: string,
): Promise<{ skill: "listening" | "reading"; level: TcfLevel } | null> {
  try {
    const row = (
      await db
        .select({ skill: tcfSets.skill, level: tcfQuestions.level })
        .from(tcfQuestions)
        .innerJoin(tcfSets, eq(tcfQuestions.setId, tcfSets.id))
        .where(eq(tcfQuestions.id, id))
        .limit(1)
    )[0];
    return row ? { skill: row.skill, level: row.level as TcfLevel } : null;
  } catch {
    // Malformed id (not a uuid) → Postgres throws; treat as not found.
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Exam attempts — the only TCF signal that flows into progress       */
/* ------------------------------------------------------------------ */

export type TcfExamAnswer = { questionId: string; chosen: number; correct: boolean };

export async function recordTcfExamAttempt(input: {
  setId: string | null;
  skill: "listening" | "reading";
  testNumber: number;
  score: number;
  total: number;
  perLevel: TcfPerLevel;
  /** Per-question detail; unanswered questions are simply absent. */
  answers?: TcfExamAnswer[];
}): Promise<void> {
  const total = Math.max(0, Math.round(input.total));
  const score = Math.min(total, Math.max(0, Math.round(input.score)));
  await db.transaction(async (tx) => {
    const [attempt] = await tx
      .insert(tcfAttempts)
      .values({
        setId: input.setId,
        skill: input.skill,
        testNumber: input.testNumber,
        score,
        total,
        perLevel: input.perLevel,
      })
      .returning({ id: tcfAttempts.id });
    if (input.answers && input.answers.length > 0) {
      await tx.insert(tcfQuestionAttempts).values(
        input.answers.map((a) => ({
          questionId: a.questionId,
          mode: "exam" as const,
          examAttemptId: attempt.id,
          chosen: a.chosen,
          correct: a.correct,
        })),
      );
    }
  });
  revalidatePath("/progress");
}

/** Drill write-through: one row per answered question. Fire-and-forget from
 *  the client — no revalidate, the drill page keeps its own local state. */
export async function recordTcfQuestionAttempt(input: {
  questionId: string;
  chosen: number;
  correct: boolean;
}): Promise<void> {
  await db.insert(tcfQuestionAttempts).values({
    questionId: input.questionId,
    mode: "drill",
    chosen: Math.max(0, Math.round(input.chosen)),
    correct: input.correct,
  });
}

/** Question ids of a drill group with at least one recorded attempt — the
 *  DB-derived "done" marks that replaced the old localStorage set. */
export async function getTcfDoneQuestionIds(
  skill: "listening" | "reading",
  level: TcfLevel,
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ questionId: tcfQuestionAttempts.questionId })
    .from(tcfQuestionAttempts)
    .innerJoin(tcfQuestions, eq(tcfQuestionAttempts.questionId, tcfQuestions.id))
    .innerJoin(tcfSets, eq(tcfQuestions.setId, tcfSets.id))
    .where(and(eq(tcfSets.skill, skill), eq(tcfQuestions.level, level)));
  return rows.map((r) => r.questionId);
}

export async function listRecentTcfAttempts(limit = 10): Promise<TcfAttempt[]> {
  return db
    .select()
    .from(tcfAttempts)
    .orderBy(desc(tcfAttempts.answeredAt))
    .limit(limit);
}

export async function getTcfDrillQuestions(
  skill: "listening" | "reading",
  level: TcfLevel,
): Promise<TcfQuestionForDrill[]> {
  const rows = await db
    .select({
      id: tcfQuestions.id,
      setId: tcfQuestions.setId,
      testNumber: tcfSets.testNumber,
      orderIndex: tcfQuestions.orderIndex,
      level: tcfQuestions.level,
      type: tcfQuestions.type,
      questionText: tcfQuestions.questionText,
      options: tcfQuestions.options,
      answer: tcfQuestions.answer,
      transcript: tcfQuestions.transcript,
      passage: tcfQuestions.passage,
      explanation: tcfQuestions.explanation,
      imagePath: tcfQuestions.imagePath,
      audioPath: tcfQuestions.audioPath,
    })
    .from(tcfQuestions)
    .innerJoin(tcfSets, eq(tcfQuestions.setId, tcfSets.id))
    .where(and(eq(tcfSets.skill, skill), eq(tcfQuestions.level, level)))
    .orderBy(asc(tcfSets.testNumber), asc(tcfQuestions.orderIndex));

  return rows.map((r) => ({
    ...r,
    level: r.level as TcfLevel,
    type: r.type as TcfQuestionForDrill["type"],
    options: r.options as string[],
    answer: r.answer,
  }));
}
