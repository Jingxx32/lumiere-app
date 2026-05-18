import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

// In dev, HMR re-executes this module on every reload, which would leak
// connections. Cache the client on globalThis so the same pool is reused.
const globalForDb = globalThis as unknown as { _pgClient?: postgres.Sql };

const client =
  globalForDb._pgClient ??
  postgres(process.env.DATABASE_URL!, {
    max: 3,
    idle_timeout: 30,
    connect_timeout: 10,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb._pgClient = client;
}

export const db = drizzle(client, { schema });
export { schema };
