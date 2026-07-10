/**
 * Local OCR for TCF reading (compréhension écrite) image questions.
 * Uses the Tesseract CLI (`brew install tesseract tesseract-lang`, French pack
 * `fra`) — fully local, NO API, NO tokens, no cost.
 *
 *   npx tsx scripts/ocr-tcf-reading.ts          # OCR all image questions missing passage
 *   npx tsx scripts/ocr-tcf-reading.ts 1        # only test 1
 *   npx tsx scripts/ocr-tcf-reading.ts 1 --force  # re-OCR even if passage already set
 *
 * Each image is "<document text> … <prompt ending in ?>". We store the document
 * in `passage` and, when a trailing interrogative line is found, lift it into
 * `questionText` (replacing the generic instruction). Options/answers are
 * untouched — they came from the MHTML import. Idempotent.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { execFileSync } from "child_process";
import path from "path";
import { existsSync } from "fs";
import postgres from "postgres";

const PUBLIC_DIR = path.join(process.cwd(), "public");

function ocrImage(absPath: string): string {
  // PSM 6 = assume a single uniform block of text (these are clean screenshots).
  const out = execFileSync(
    "tesseract",
    [absPath, "-", "-l", "fra", "--psm", "6"],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  return out;
}

/** Tidy raw OCR text: trim lines, drop blanks, collapse runs of spaces. */
function clean(raw: string): string[] {
  return raw
    .split("\n")
    .map((l) => l.replace(/[ \t]{2,}/g, " ").trim())
    .filter(Boolean);
}

/** Split OCR lines into { passage, prompt }. Prompt = trailing interrogative line. */
function splitPrompt(lines: string[]): { passage: string; prompt: string | null } {
  if (lines.length >= 2) {
    const last = lines[lines.length - 1];
    // A real prompt is a short-ish question; guard against grabbing passage prose.
    if (last.endsWith("?") && last.length <= 200) {
      return { passage: lines.slice(0, -1).join("\n").trim(), prompt: last };
    }
  }
  return { passage: lines.join("\n").trim(), prompt: null };
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const testArg = args.find((a) => /^\d+$/.test(a));
  const testNumber = testArg ? parseInt(testArg, 10) : null;

  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

  const rows = await sql<
    { id: string; orderIndex: number; testNumber: number; imagePath: string; hasPassage: boolean }[]
  >`
    SELECT q.id, q.order_index AS "orderIndex", s.test_number AS "testNumber",
           q.image_path AS "imagePath", (q.passage IS NOT NULL) AS "hasPassage"
    FROM tcf_questions q
    JOIN tcf_sets s ON s.id = q.set_id
    WHERE s.skill = 'reading'
      AND q.image_path IS NOT NULL
      ${testNumber !== null ? sql`AND s.test_number = ${testNumber}` : sql``}
    ORDER BY s.test_number, q.order_index
  `;

  const todo = force ? rows : rows.filter((r) => !r.hasPassage);
  console.log(
    `OCR target: ${todo.length} image questions` +
      (force ? " (force)" : " (missing passage)") +
      (testNumber !== null ? ` in test ${testNumber}` : "") +
      "\n",
  );

  let done = 0;
  let prompts = 0;
  let missingFiles = 0;

  for (const r of todo) {
    const abs = path.join(PUBLIC_DIR, r.imagePath);
    if (!existsSync(abs)) {
      missingFiles++;
      console.warn(`  ⚠ missing file: ${r.imagePath}`);
      continue;
    }

    let lines: string[];
    try {
      lines = clean(ocrImage(abs));
    } catch (e) {
      console.warn(`  ⚠ OCR failed for ${r.imagePath}: ${(e as Error).message}`);
      continue;
    }
    if (lines.length === 0) continue;

    const { passage, prompt } = splitPrompt(lines);
    if (prompt) {
      prompts++;
      await sql`UPDATE tcf_questions SET passage = ${passage}, question_text = ${prompt} WHERE id = ${r.id}`;
    } else {
      await sql`UPDATE tcf_questions SET passage = ${passage} WHERE id = ${r.id}`;
    }

    done++;
    if (done % 50 === 0) console.log(`  …${done}/${todo.length}`);
  }

  console.log(
    `\nDone. OCR'd ${done} questions (${prompts} with extracted prompt)` +
      (missingFiles ? `, ${missingFiles} files missing` : "") +
      ".",
  );
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
