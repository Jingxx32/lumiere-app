import { config } from "dotenv";
config({ path: ".env" });

import path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { sql } from "drizzle-orm";

const client = postgres(process.env.DATABASE_URL!, { max: 1 });
const db = drizzle(client);

// Count pending migrations
const applied = await db.execute(sql`SELECT count(*) FROM drizzle.__drizzle_migrations`);
console.log("Applied migrations count:", (applied[0] as Record<string, unknown>).count);

console.log("Running migrate...");
await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
console.log("Done.");

const applied2 = await db.execute(sql`SELECT count(*) FROM drizzle.__drizzle_migrations`);
console.log("Applied migrations count after:", (applied2[0] as Record<string, unknown>).count);

await client.end();
