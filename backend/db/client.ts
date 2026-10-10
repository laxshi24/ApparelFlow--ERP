import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@backend/config/env";
import * as schema from "@backend/db/schema";

export type Database = PostgresJsDatabase<typeof schema>;
/** A database handle usable both at top level and inside `db.transaction(...)`. */
export type DbExecutor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

const globalForDb = globalThis as unknown as { __apparelflowSql?: postgres.Sql; __apparelflowDb?: Database };

function create(): Database {
  const { DATABASE_URL, DATABASE_POOL_MAX } = env();
  const client = postgres(DATABASE_URL, {
    max: DATABASE_POOL_MAX,
    // Transaction-mode poolers (Neon, Supabase, PgBouncer) do not support named prepared statements.
    prepare: false,
    onnotice: () => {},
  });
  globalForDb.__apparelflowSql = client;
  return drizzle(client, { schema });
}

/** Lazily created singleton; reused across hot reloads in development. */
export function db(): Database {
  globalForDb.__apparelflowDb ??= create();
  return globalForDb.__apparelflowDb;
}

export async function closeDb(): Promise<void> {
  await globalForDb.__apparelflowSql?.end({ timeout: 5 });
  globalForDb.__apparelflowSql = undefined;
  globalForDb.__apparelflowDb = undefined;
}
