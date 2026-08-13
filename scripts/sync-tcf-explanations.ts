/**
 * Sync hand-written TCF explanations into the DB.
 *
 *   npm run tcf:explain-sync
 *
 * The explanation files embed copyrighted TCF exam passages, so — like the
 * reading/listening import sources — they cannot live in this repo: `data/`
 * is gitignored (see .gitignore) and this repo has a public GitHub remote.
 * They live in a private repo outside lumiere; point TCF_EXPLANATIONS_DIR at
 * your local checkout of it. Files there are the source of truth; this
 * script only projects them onto tcf_questions.explanation / .translation_en.
 * Re-running a test import (which deletes + re-inserts its questions) wipes
 * those columns — re-run this script afterwards to restore every explanation.
 *
 * If TCF_EXPLANATIONS_DIR is unset, this falls back to data/tcf-explanations
 * under the repo (gitignored, untracked) so a fresh clone still runs — but
 * that fallback isn't durable storage; nothing written there survives being
 * wiped or a fresh clone.
 *
 * Idempotent: each file targets exactly one row, matched on
 * tcf_sets.test_number + tcf_sets.skill + tcf_questions.order_index.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { existsSync, readdirSync, readFileSync } from "fs";
import path from "path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, and, or, isNotNull, notInArray } from "drizzle-orm";

import { tcfSets, tcfQuestions } from "../src/lib/db/schema";
import { parseExplanationFile, expectedFileName } from "../src/lib/tcf/parse-explanation";

const DIR_IS_FALLBACK = process.env.TCF_EXPLANATIONS_DIR === undefined;
const DIR = process.env.TCF_EXPLANATIONS_DIR ?? path.join(process.cwd(), "data", "tcf-explanations");

function describeDir(): string {
  return DIR_IS_FALLBACK
    ? `${DIR} (TCF_EXPLANATIONS_DIR is not set — falling back to the in-repo directory, which is not durable storage)`
    : DIR;
}

async function main() {
  if (!existsSync(DIR)) {
    console.log(`Explanations directory not found at ${describeDir()} — nothing to do.`);
    return;
  }

  const files = readdirSync(DIR)
    .filter((f) => f.endsWith(".md"))
    .sort();

  if (files.length === 0) {
    console.log(`No explanation files in ${describeDir()} — nothing to do.`);
    return;
  }

  const client = postgres(process.env.DATABASE_URL!, { max: 1 });
  const db = drizzle(client);

  let updated = 0;
  const problems: string[] = [];
  // Rows this run wrote to — excluded from the orphan check below.
  const claimedIds = new Set<string>();
  // (test, skill) pairs the file set actually names — scopes the orphan check
  // so a set the run never touched is never reported as drifted.
  const touchedSets = new Map<string, { test: number; skill: "reading" | "listening" }>();

  for (const file of files) {
    try {
      const parsed = parseExplanationFile(readFileSync(path.join(DIR, file), "utf8"));
      touchedSets.set(`${parsed.test}|${parsed.skill}`, { test: parsed.test, skill: parsed.skill });

      const expected = expectedFileName(parsed);
      if (file !== expected) {
        problems.push(`${file}: frontmatter says this should be named ${expected}`);
        continue;
      }

      const rows = await db
        .select({ id: tcfQuestions.id })
        .from(tcfQuestions)
        .innerJoin(tcfSets, eq(tcfQuestions.setId, tcfSets.id))
        .where(
          and(
            eq(tcfSets.testNumber, parsed.test),
            eq(tcfSets.skill, parsed.skill),
            eq(tcfQuestions.orderIndex, parsed.question),
          ),
        );

      if (rows.length === 0) {
        problems.push(
          `${file}: no question for test ${parsed.test} / ${parsed.skill} / Q${parsed.question}`,
        );
        continue;
      }
      if (rows.length > 1) {
        problems.push(`${file}: locator matched ${rows.length} rows — refusing to guess`);
        continue;
      }

      await db
        .update(tcfQuestions)
        .set({
          explanation: parsed.body,
          translationEn: parsed.translationEn,
        })
        .where(eq(tcfQuestions.id, rows[0].id));

      claimedIds.add(rows[0].id);
      updated += 1;
      console.log(`✓ ${file}`);
    } catch (err) {
      problems.push(`${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Reconciliation: within the sets this run's files actually named, find
  // questions that still carry an explanation but weren't claimed by any
  // file this run — e.g. a file was renamed/re-targeted or deleted, so the
  // old row's explanation is now orphaned drift between files and DB.
  const orphans: { test: number; skill: string; question: number }[] = [];
  if (touchedSets.size > 0) {
    const setConditions = [...touchedSets.values()].map((s) =>
      and(eq(tcfSets.testNumber, s.test), eq(tcfSets.skill, s.skill)),
    );

    const orphanRows = await db
      .select({
        testNumber: tcfSets.testNumber,
        skill: tcfSets.skill,
        orderIndex: tcfQuestions.orderIndex,
      })
      .from(tcfQuestions)
      .innerJoin(tcfSets, eq(tcfQuestions.setId, tcfSets.id))
      .where(
        and(
          or(...setConditions),
          isNotNull(tcfQuestions.explanation),
          claimedIds.size > 0 ? notInArray(tcfQuestions.id, [...claimedIds]) : undefined,
        ),
      );

    for (const r of orphanRows) {
      orphans.push({ test: r.testNumber, skill: r.skill, question: r.orderIndex });
    }
  }

  await client.end();

  console.log(`\n${updated}/${files.length} explanation(s) synced.`);

  if (orphans.length > 0) {
    console.warn(
      `\n${orphans.length} orphaned explanation(s) — these questions carry an explanation in the ` +
        `database with no corresponding file in this run, so the file set and database have diverged:`,
    );
    for (const o of orphans) {
      const prefix = o.skill === "reading" ? "CE" : "CO";
      console.warn(`  ⚠ ${prefix}-T${o.test}-Q${o.question}`);
    }
  }

  if (problems.length > 0) {
    console.error(`\n${problems.length} problem(s):`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
