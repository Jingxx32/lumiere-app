/**
 * Backfill image_path for TCF image-type questions that already have a file in
 * public/media/tcf/test{N}/q{NN}.png.
 *
 *   npx tsx scripts/backfill-image-paths.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { existsSync } from "fs";
import path from "path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, and, isNull } from "drizzle-orm";
import { tcfSets, tcfQuestions } from "../src/lib/db/schema";

const PROJECT_ROOT = path.join(__dirname, "..");

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { max: 1 });
  const db = drizzle(client);

  // Find all image-type questions without an image_path
  const sets = await db.select().from(tcfSets).where(eq(tcfSets.skill, "listening"));

  for (const set of sets) {
    const questions = await db
      .select()
      .from(tcfQuestions)
      .where(and(eq(tcfQuestions.setId, set.id), eq(tcfQuestions.type, "image"), isNull(tcfQuestions.imagePath)));

    for (const q of questions) {
      const qNum = String(q.orderIndex).padStart(2, "0");
      const relPath = `/media/tcf/test${set.testNumber}/q${qNum}.png`;
      const absPath = path.join(PROJECT_ROOT, "public", relPath);

      if (existsSync(absPath)) {
        await db
          .update(tcfQuestions)
          .set({ imagePath: relPath })
          .where(eq(tcfQuestions.id, q.id));
        console.log(`✓ test${set.testNumber} Q${q.orderIndex} → ${relPath}`);
      } else {
        console.log(`  test${set.testNumber} Q${q.orderIndex} — file not found: ${absPath}`);
      }
    }
  }

  await client.end();
  console.log("Done.");
}

main().catch(e => { console.error(e); process.exit(1); });
