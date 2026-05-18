/**
 * Initialise / migrate the PostgreSQL database using Drizzle's migrator.
 * Safe to run multiple times — only applies pending migrations.
 *
 *   npm run db:init
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { max: 1 });
  const db = drizzle(client);

  console.log("Applying migrations to Azure PostgreSQL…");
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  console.log("✓ Database is up to date.");

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
