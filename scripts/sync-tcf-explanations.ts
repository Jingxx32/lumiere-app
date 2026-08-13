/**
 * Sync hand-written TCF explanations into the DB.
 *
 *   npm run tcf:explain-sync
 *
 * Files under data/tcf-explanations/*.md are the source of truth; this script
 * only projects them onto tcf_questions.explanation / .translation_en. Re-running
 * a test import (which deletes + re-inserts its questions) wipes those columns —
 * re-run this script afterwards to restore every explanation.
 *
 * Idempotent: each file targets exactly one row, matched on
 * tcf_sets.test_number + tcf_sets.skill + tcf_questions.order_index.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { readdirSync, readFileSync } from "fs";
import path from "path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, and } from "drizzle-orm";

import { tcfSets, tcfQuestions } from "../src/lib/db/schema";
import { parseExplanationFile, expectedFileName } from "../src/lib/tcf/parse-explanation";

const DIR = path.join(process.cwd(), "data", "tcf-explanations");

async function main() {
  const files = readdirSync(DIR)
    .filter((f) => f.endsWith(".md"))
    .sort();

  if (files.length === 0) {
    console.log("No explanation files in data/tcf-explanations — nothing to do.");
    return;
  }

  const client = postgres(process.env.DATABASE_URL!, { max: 1 });
  const db = drizzle(client);

  let updated = 0;
  const problems: string[] = [];

  for (const file of files) {
    try {
      const parsed = parseExplanationFile(readFileSync(path.join(DIR, file), "utf8"));

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
          ...(parsed.translationEn ? { translationEn: parsed.translationEn } : {}),
        })
        .where(eq(tcfQuestions.id, rows[0].id));

      updated += 1;
      console.log(`✓ ${file}`);
    } catch (err) {
      problems.push(`${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await client.end();

  console.log(`\n${updated}/${files.length} explanation(s) synced.`);
  if (problems.length > 0) {
    console.error(`\n${problems.length} problem(s):`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exitCode = 1;
  }
}

main();
