/**
 * Import TCF Compréhension écrite (reading) questions into the DB.
 * No audio, no AI, no network — pure local parsing.
 *
 *   npx tsx scripts/import-tcf-reading.ts          # import all (mhtml 1–38 + pdf 40)
 *   npx tsx scripts/import-tcf-reading.ts 40       # import only test 40
 *
 * Two sources, one schema (skill = "reading", type = "reading_mcq"):
 *   - tests 1–38: MHTML exports → image-based questions (passage baked into a PNG,
 *     extracted from the archive into public/media/tcf/reading/testN/qNN.png)
 *   - test 40:    text PDF → real passage text in the `passage` column
 *
 * Skipped for now (logged): the "GR" mhtml variants (grammaire supplements) and
 * test 39 (image-only PDF with no MHTML).
 *
 * Idempotent: re-running a test deletes + re-inserts its questions.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, and } from "drizzle-orm";
import { PDFParse } from "pdf-parse";
import { tcfSets, tcfQuestions } from "../src/lib/db/schema";
import { parseMhtml, parseReadingMhtml } from "../src/lib/tcf/parse-reading-mhtml";
import { parseReadingPdf } from "../src/lib/tcf/parse-reading-pdf";

const READING_DIR =
  "<TCF_READING_DIR>";
const MHTML_DIR = path.join(
  READING_DIR,
  "mhtml",
);
const PDF_TEST40 = path.join(READING_DIR, "test-40.pdf");
const MEDIA_BASE = path.join(process.cwd(), "public", "media", "tcf", "reading");
const SOURCE = "RÉUSSIR TCF CANADA";
const INSTRUCTION = "Lisez le document et choisissez la bonne réponse.";

type Level = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

/** Same index→CEFR mapping the listening sets use (39 questions, A1 → C2). */
function getLevel(n: number): Level {
  if (n <= 4) return "A1";
  if (n <= 10) return "A2";
  if (n <= 19) return "B1";
  if (n <= 29) return "B2";
  if (n <= 35) return "C1";
  return "C2";
}

function extFor(contentType: string): string {
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  if (contentType.includes("gif")) return "gif";
  if (contentType.includes("webp")) return "webp";
  return "png";
}

/** Upsert a reading set, clearing its old questions. Returns the set id. */
async function upsertSet(
  db: ReturnType<typeof drizzle>,
  testNumber: number,
  title: string,
): Promise<string> {
  const existing = await db
    .select()
    .from(tcfSets)
    .where(and(eq(tcfSets.testNumber, testNumber), eq(tcfSets.skill, "reading")))
    .limit(1);

  if (existing.length > 0) {
    await db.delete(tcfQuestions).where(eq(tcfQuestions.setId, existing[0].id));
    return existing[0].id;
  }
  const [inserted] = await db
    .insert(tcfSets)
    .values({ testNumber, skill: "reading", title, source: SOURCE })
    .returning();
  return inserted.id;
}

async function importMhtml(
  db: ReturnType<typeof drizzle>,
  testNumber: number,
  file: string,
): Promise<void> {
  const arc = parseMhtml(readFileSync(file));
  const questions = parseReadingMhtml(arc.html);
  if (questions.length === 0) {
    console.warn(`  ⚠ Test ${testNumber}: no questions parsed — skipping`);
    return;
  }

  const outDir = path.join(MEDIA_BASE, `test${testNumber}`);
  mkdirSync(outDir, { recursive: true });

  const setId = await upsertSet(db, testNumber, `Compréhension écrite test ${testNumber}`);

  let missingImages = 0;
  const rows = questions.map((q) => {
    let imagePath: string | null = null;
    const res = q.imageUrl ? arc.resources.get(q.imageUrl) : undefined;
    if (res) {
      const ext = extFor(res.contentType);
      const file = `q${String(q.orderIndex).padStart(2, "0")}.${ext}`;
      writeFileSync(path.join(outDir, file), res.buffer);
      imagePath = `/media/tcf/reading/test${testNumber}/${file}`;
    } else {
      missingImages++;
    }
    return {
      setId,
      orderIndex: q.orderIndex,
      level: getLevel(q.orderIndex),
      type: "reading_mcq" as const,
      questionText: INSTRUCTION,
      options: q.options,
      answer: q.answer,
      transcript: null,
      passage: null,
      translationEn: null,
      explanation: null,
      imagePath,
      audioPath: null,
    };
  });

  await db.insert(tcfQuestions).values(rows);
  console.log(
    `  ✓ Test ${testNumber}: ${rows.length} questions` +
      (missingImages ? ` (⚠ ${missingImages} images missing)` : ""),
  );
}

async function importPdf40(db: ReturnType<typeof drizzle>): Promise<void> {
  const parser = new PDFParse({ data: new Uint8Array(readFileSync(PDF_TEST40)) });
  const result = await parser.getText();
  await parser.destroy();

  const questions = parseReadingPdf(result.text);
  if (questions.length === 0) {
    console.warn("  ⚠ Test 40: no questions parsed — skipping");
    return;
  }

  const setId = await upsertSet(db, 40, "Compréhension écrite test 40");
  await db.insert(tcfQuestions).values(
    questions.map((q) => ({
      setId,
      orderIndex: q.orderIndex,
      level: getLevel(q.orderIndex),
      type: "reading_mcq" as const,
      questionText: q.questionText || INSTRUCTION,
      options: q.options,
      answer: q.answer,
      transcript: null,
      passage: q.passage,
      translationEn: null,
      explanation: null,
      imagePath: null,
      audioPath: null,
    })),
  );
  console.log(`  ✓ Test 40: ${questions.length} questions (text passages)`);
}

async function main() {
  const target = process.argv[2] ? parseInt(process.argv[2], 10) : null;

  const client = postgres(process.env.DATABASE_URL!, { max: 1 });
  const db = drizzle(client);

  // Map plain (non-GR) mhtml files to test numbers.
  const mhtmlByNum = new Map<number, string>();
  for (const f of readdirSync(MHTML_DIR)) {
    if (!f.toLowerCase().endsWith(".mhtml")) continue;
    const m = f.match(/test\s+(\d+)\s*(GR)?/i);
    if (!m) continue;
    if (m[2]) {
      console.log(`  ↷ Skipping GR variant: ${f}`);
      continue;
    }
    mhtmlByNum.set(parseInt(m[1], 10), path.join(MHTML_DIR, f));
  }

  const numbers = [...mhtmlByNum.keys()].sort((a, b) => a - b);
  console.log(`Importing reading: ${numbers.length} mhtml tests + test 40 (pdf)\n`);

  for (const n of numbers) {
    if (target !== null && target !== n) continue;
    await importMhtml(db, n, mhtmlByNum.get(n)!);
  }

  if (target === null || target === 40) {
    await importPdf40(db);
  }

  await client.end();
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
