import { config } from "dotenv";
config({ path: ".env" });

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";

const client = postgres(process.env.DATABASE_URL!, { max: 1 });
const db = drizzle(client);

const rows = await db.execute(sql`SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at`);
console.log("Applied migrations:", rows.map((r: Record<string, unknown>) => r.hash));

// Also check vocabulary_lookups table structure
try {
  const cols = await db.execute(sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'vocabulary_lookups' ORDER BY ordinal_position`);
  console.log("vocabulary_lookups columns:", cols.map((c: Record<string, unknown>) => c.column_name));
} catch (e) {
  console.log("vocabulary_lookups doesn't exist yet");
}

await client.end();
