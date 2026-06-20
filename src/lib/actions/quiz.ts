"use server";

import { randomUUID } from "node:crypto";
import { eq, desc, and, inArray, asc, type SQL } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import {
  quizSets,
  quizPassages,
  quizQuestions,
  quizAttempts,
  type QuizSet,
  type QuizPassage,
  type QuizQuestion,
  type QuizAttempt,
} from "@/lib/db/schema";
import { extractPdfText } from "@/lib/pdf/extract";
import { parseQuizFromText } from "@/lib/ai/quiz-parse";
import { QuizParseSchema, type ParsedQuiz } from "@/lib/ai/quiz-schema";

const QUIZ_SECTIONS = [
  "reading",
  "listening",
  "grammar",
  "vocabulary",
  "dictation",
  "conjugation",
] as const;
type QuizSection = (typeof QUIZ_SECTIONS)[number];

/* ------------------------------------------------------------------ */
/*  Import — step 1: parse only, no DB write (D-4 preview)             */
/* ------------------------------------------------------------------ */

export type ImportQuizResult =
  | { ok: true; parsed: ParsedQuiz }
  | { ok: false; error: "scanned" | "parse_failed" | "empty" };

export async function importQuizFromPdf(
  formData: FormData,
): Promise<ImportQuizResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "empty" };
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const { text, looksScanned } = await extractPdfText(buf);
  if (looksScanned || !text.trim()) {
    return { ok: false, error: "scanned" };
  }

  return parsePastedOrExtractedText(text);
}

export async function parseQuizFromPastedText(
  rawText: string,
): Promise<ImportQuizResult> {
  if (!rawText.trim()) return { ok: false, error: "empty" };
  return parsePastedOrExtractedText(rawText);
}

async function parsePastedOrExtractedText(
  text: string,
): Promise<ImportQuizResult> {
  try {
    const parsed = await parseQuizFromText(text, "reading");
    if (parsed.passages.length === 0) {
      return { ok: false, error: "parse_failed" };
    }
    return { ok: true, parsed };
  } catch {
    return { ok: false, error: "parse_failed" };
  }
}

/* ------------------------------------------------------------------ */
/*  Import — step 2: confirmed insert (writes 3 tables)                */
/* ------------------------------------------------------------------ */

export async function confirmQuizImport(input: {
  exam: string;
  number: number | null;
  section: QuizSection;
  title: string;
  source?: string | null;
  parsed: ParsedQuiz;
}): Promise<{ setId: string }> {
  // Re-validate the client-held preview payload before trusting it
  const parsed = QuizParseSchema.parse(input.parsed);

  const setId = randomUUID();
  await db.insert(quizSets).values({
    id: setId,
    exam: input.exam.trim() || "TCF",
    number: input.number,
    section: input.section,
    title: input.title.trim() || "Untitled set",
    source: input.source?.trim() || null,
  });

  for (const [pIndex, passage] of parsed.passages.entries()) {
    const passageId = randomUUID();
    await db.insert(quizPassages).values({
      id: passageId,
      setId,
      orderIndex: pIndex,
      text: passage.text,
    });

    if (passage.questions.length > 0) {
      await db.insert(quizQuestions).values(
        passage.questions.map((q, qIndex) => ({
          id: randomUUID(),
          passageId,
          orderIndex: qIndex,
          type: q.type,
          questionText: q.questionText,
          options: q.options,
          answer: q.correctIndex,
          explanation: q.explanation,
        })),
      );
    }
  }

  revalidatePath("/quiz");
  return { setId };
}

/* ------------------------------------------------------------------ */
/*  Attempts                                                           */
/* ------------------------------------------------------------------ */

export async function submitQuizAttempt(input: {
  setId: string;
  score: number;
  total: number;
}): Promise<QuizAttempt> {
  const [attempt] = await db
    .insert(quizAttempts)
    .values({
      id: randomUUID(),
      setId: input.setId,
      score: input.score,
      total: input.total,
    })
    .returning();

  revalidatePath("/quiz");
  return attempt;
}

/* ------------------------------------------------------------------ */
/*  Read helpers (callable from server components)                     */
/* ------------------------------------------------------------------ */

export type QuizSetListItem = QuizSet & {
  questionCount: number;
  latestAttempt: QuizAttempt | null;
};

export async function listQuizSets(opts?: {
  exam?: string;
  section?: string;
}): Promise<QuizSetListItem[]> {
  const filters: SQL[] = [];
  if (opts?.exam && opts.exam !== "all") {
    filters.push(eq(quizSets.exam, opts.exam));
  }
  if (
    opts?.section &&
    opts.section !== "all" &&
    QUIZ_SECTIONS.includes(opts.section as QuizSection)
  ) {
    filters.push(eq(quizSets.section, opts.section as QuizSection));
  }

  const sets = await db
    .select()
    .from(quizSets)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(quizSets.createdAt));

  if (sets.length === 0) return [];
  const setIds = sets.map((s) => s.id);

  const [passages, attempts] = await Promise.all([
    db
      .select({ id: quizPassages.id, setId: quizPassages.setId })
      .from(quizPassages)
      .where(inArray(quizPassages.setId, setIds)),
    db
      .select()
      .from(quizAttempts)
      .where(inArray(quizAttempts.setId, setIds))
      .orderBy(desc(quizAttempts.answeredAt)),
  ]);

  const questionCounts = new Map<string, number>();
  if (passages.length > 0) {
    const questions = await db
      .select({ passageId: quizQuestions.passageId })
      .from(quizQuestions)
      .where(
        inArray(
          quizQuestions.passageId,
          passages.map((p) => p.id),
        ),
      );
    const passageToSet = new Map(passages.map((p) => [p.id, p.setId]));
    for (const q of questions) {
      const setId = passageToSet.get(q.passageId);
      if (!setId) continue;
      questionCounts.set(setId, (questionCounts.get(setId) ?? 0) + 1);
    }
  }

  const latestAttemptBySet = new Map<string, QuizAttempt>();
  for (const a of attempts) {
    if (!latestAttemptBySet.has(a.setId)) latestAttemptBySet.set(a.setId, a);
  }

  return sets.map((set) => ({
    ...set,
    questionCount: questionCounts.get(set.id) ?? 0,
    latestAttempt: latestAttemptBySet.get(set.id) ?? null,
  }));
}

export type QuizSetDetail = {
  set: QuizSet;
  passages: (QuizPassage & { questions: QuizQuestion[] })[];
};

export async function getQuizSet(setId: string): Promise<QuizSetDetail | null> {
  const set = await db
    .select()
    .from(quizSets)
    .where(eq(quizSets.id, setId))
    .limit(1)
    .then((r) => r[0] ?? null);
  if (!set) return null;

  const passages = await db
    .select()
    .from(quizPassages)
    .where(eq(quizPassages.setId, setId))
    .orderBy(asc(quizPassages.orderIndex));

  const questions =
    passages.length > 0
      ? await db
          .select()
          .from(quizQuestions)
          .where(
            inArray(
              quizQuestions.passageId,
              passages.map((p) => p.id),
            ),
          )
          .orderBy(asc(quizQuestions.orderIndex))
      : [];

  return {
    set,
    passages: passages.map((p) => ({
      ...p,
      questions: questions.filter((q) => q.passageId === p.id),
    })),
  };
}

export async function deleteQuizSet(setId: string) {
  await db.delete(quizSets).where(eq(quizSets.id, setId));
  revalidatePath("/quiz");
}
