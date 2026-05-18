"use server";

import { eq, desc, count, gte, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { errors, submissions, userSettings } from "@/lib/db/schema";
import type { CefrLevel } from "@/lib/cefr";
import { CEFR_LEVELS } from "@/lib/cefr";
import type { ErrorCategory } from "@/lib/taxonomy";
import { ALL_SUBCATEGORIES } from "@/lib/taxonomy";
import type { LearnerProfile, WeakGrammarEntry } from "@/lib/learner-profile";
import {
  PROFILE_MIN_ERRORS,
  PROFILE_MIN_SUBMISSIONS,
} from "@/lib/learner-profile";

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

const RECENT_SUBMISSION_LIMIT = 50;
const MASTERED_VOCAB_CAP = 200;
const STRONG_WINDOW_DAYS = 90;
const TREND_WINDOW_DAYS = 30;

function classifyTrend(
  recent: number,
  prior: number,
): WeakGrammarEntry["trend"] {
  if (prior === 0 && recent === 0) return "stable";
  if (prior === 0) return "worsening";
  if (recent * 2 <= prior) return "improving";
  if (recent >= prior * 2) return "worsening";
  return "stable";
}

/* ------------------------------------------------------------------ */
/*  buildLearnerProfile                                                 */
/* ------------------------------------------------------------------ */

export async function buildLearnerProfile(): Promise<LearnerProfile> {
  const now = Date.now();
  const cutoff60 = new Date(now - 60 * 86_400_000);
  const cutoff30 = new Date(now - TREND_WINDOW_DAYS * 86_400_000);
  const cutoff90 = new Date(now - STRONG_WINDOW_DAYS * 86_400_000);

  const [
    cefrRow,
    subTotalRow,
    errTotalRow,
    weakRows,
    trendRows,
    recentSubRows,
    recentSubcatRows,
  ] = await Promise.all([
    db
      .select()
      .from(userSettings)
      .where(eq(userSettings.key, "cefr_level"))
      .limit(1)
      .then((r) => r[0] ?? null),
    db.select({ count: count() }).from(submissions),
    db.select({ count: count() }).from(errors),
    db
      .select({
        category: errors.category,
        subcategory: errors.subcategory,
        count: count(),
      })
      .from(errors)
      .groupBy(errors.category, errors.subcategory)
      .orderBy(desc(count()))
      .limit(8),
    db
      .select({
        category: errors.category,
        subcategory: errors.subcategory,
        createdAt: errors.createdAt,
      })
      .from(errors)
      .where(gte(errors.createdAt, cutoff60)),
    db
      .select()
      .from(submissions)
      .orderBy(desc(submissions.submittedAt))
      .limit(RECENT_SUBMISSION_LIMIT),
    db
      .select({ subcategory: errors.subcategory })
      .from(errors)
      .where(gte(errors.createdAt, cutoff90)),
  ]);

  const declaredLevel = cefrRow?.value;
  const cefrLevel: CefrLevel = CEFR_LEVELS.includes(declaredLevel as CefrLevel)
    ? (declaredLevel as CefrLevel)
    : "B1";

  const totalSubmissions = Number(subTotalRow[0]?.count ?? 0);
  const totalErrors = Number(errTotalRow[0]?.count ?? 0);

  // Trend per weak subcategory: split last-60d errors into [30,60)d prior and [0,30)d recent.
  const recentMap = new Map<string, number>();
  const priorMap = new Map<string, number>();
  for (const row of trendRows) {
    const key = `${row.category}::${row.subcategory}`;
    const target = row.createdAt >= cutoff30 ? recentMap : priorMap;
    target.set(key, (target.get(key) ?? 0) + 1);
  }

  const weakGrammar: WeakGrammarEntry[] = weakRows.map((row) => {
    const key = `${row.category}::${row.subcategory}`;
    return {
      category: row.category as ErrorCategory,
      subcategory: row.subcategory,
      count: Number(row.count),
      trend: classifyTrend(recentMap.get(key) ?? 0, priorMap.get(key) ?? 0),
    };
  });

  // Mastered vocab: tokens from recent submissions, excluding any token inside an error span.
  let masteredVocab: string[] = [];
  if (recentSubRows.length > 0) {
    const subIds = recentSubRows.map((s) => s.id);
    const errorSpans = await db
      .select({
        submissionId: errors.submissionId,
        spanStart: errors.spanStart,
        spanEnd: errors.spanEnd,
      })
      .from(errors)
      .where(inArray(errors.submissionId, subIds));

    const spansBySub = new Map<string, Array<[number, number]>>();
    for (const span of errorSpans) {
      const arr = spansBySub.get(span.submissionId) ?? [];
      arr.push([span.spanStart, span.spanEnd]);
      spansBySub.set(span.submissionId, arr);
    }

    const wordRe = /\p{L}+/gu;
    const seen = new Set<string>();
    for (const sub of recentSubRows) {
      const spans = spansBySub.get(sub.id) ?? [];
      const text = sub.contentFr;
      for (const match of text.matchAll(wordRe)) {
        const start = match.index ?? 0;
        const end = start + match[0].length;
        const overlapsError = spans.some(
          ([s, e]) => start < e && end > s,
        );
        if (overlapsError) continue;
        const token = match[0].toLowerCase().normalize("NFC");
        if (token.length < 2) continue;
        seen.add(token);
        if (seen.size >= MASTERED_VOCAB_CAP) break;
      }
      if (seen.size >= MASTERED_VOCAB_CAP) break;
    }
    masteredVocab = Array.from(seen);
  }

  // Strong grammar: subcategories absent from the last 90 days of errors.
  const erredRecently = new Set(recentSubcatRows.map((r) => r.subcategory));
  const strongGrammar = ALL_SUBCATEGORIES.filter(
    (s) => !erredRecently.has(s.subcategory),
  ).map((s) => s.subcategory);

  const hasEnoughSignal =
    totalSubmissions >= PROFILE_MIN_SUBMISSIONS &&
    totalErrors >= PROFILE_MIN_ERRORS;

  return {
    cefrLevel,
    totalSubmissions,
    totalErrors,
    weakGrammar,
    masteredVocab,
    strongGrammar,
    hasEnoughSignal,
  };
}

