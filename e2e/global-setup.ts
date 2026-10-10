import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { runMigrations } from "../src/lib/database/migrate";
import * as schema from "../src/lib/database/schema";
import { runSeed } from "../src/lib/database/seed";
import { E2E_PASSWORDS } from "./credentials";

/** Resets the dedicated E2E database: wipe schema, migrate, seed recipes + demo users. */
export default async function globalSetup() {
  const url = process.env.E2E_DATABASE_URL!;
  const admin = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;");
  } finally {
    await admin.end();
  }
  await runMigrations(url);
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await runSeed(drizzle(client, { schema }), { passwords: E2E_PASSWORDS });
  } finally {
    await client.end();
  }
}
