import { config } from "dotenv";
config({ path: ".env" });

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) throw new Error("DATABASE_URL not set");

const client = postgres(dbUrl, { max: 1 });
const db = drizzle(client);

async function main() {
  await db.execute(sql`TRUNCATE vocabulary_lookups CASCADE`);
  console.log("Truncated vocabulary_lookups");
  await client.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
