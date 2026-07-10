/**
 * Import TCF speaking prompts from data/tcf-speaking.json.
 *
 *   npx tsx scripts/import-tcf-speaking.ts
 *
 * (scripts/ and data/ are gitignored by repo convention — this importer and
 * the question bank live locally, same as import-tcf-reading.ts.)
 *
 * Idempotent: upserts on (task, prompt) — re-running updates context/source,
 * never duplicates, never deletes rows missing from the JSON.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { readFileSync } from "fs";
import path from "path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import { speakingPrompts } from "../src/lib/db/schema";

type Entry = { task: number; prompt: string; context?: string | null; source?: string | null };

async function main() {
  const file = path.join(process.cwd(), "data", "tcf-speaking.json");
  const entries: Entry[] = JSON.parse(readFileSync(file, "utf-8"));

  const bad = entries.filter((e) => ![1, 2, 3].includes(e.task) || !e.prompt?.trim());
  if (bad.length > 0) {
    console.error(`✗ ${bad.length} invalid entries (task must be 1|2|3, prompt required):`, bad);
    process.exit(1);
  }

  const client = postgres(process.env.DATABASE_URL!, { max: 1 });
  const db = drizzle(client);

  for (const e of entries) {
    await db
      .insert(speakingPrompts)
      .values({
        task: e.task,
        prompt: e.prompt.trim(),
        context: e.context?.trim() || null,
        source: e.source?.trim() || null,
      })
      .onConflictDoUpdate({
        target: [speakingPrompts.task, speakingPrompts.prompt],
        set: {
          context: sql`excluded.context`,
          source: sql`excluded.source`,
        },
      });
  }

  const counts = await client`
    select task, count(*)::int as n from speaking_prompts group by task order by task`;
  console.log("✓ Imported. Prompts per tâche:", counts.map((r) => `T${r.task}=${r.n}`).join(" "));
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
