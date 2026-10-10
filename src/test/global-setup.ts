/**
 * Vitest global setup for integration tests: wipes the dedicated test database,
 * applies all migrations and seeds recipes + demo users. Never touches DATABASE_URL.
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { runMigrations } from "@/lib/database/migrate";
import * as schema from "@/lib/database/schema";
import { runSeed } from "@/lib/database/seed";
import { TEST_PASSWORDS } from "./constants";

export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set (see .env.example). Integration tests need a dedicated database.");
  if (url === process.env.DATABASE_URL) throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL: the test run wipes it.");

  const admin = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;");
  } finally {
    await admin.end();
  }
  await runMigrations(url);

  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await runSeed(drizzle(client, { schema }), { passwords: TEST_PASSWORDS });
  } finally {
    await client.end();
  }
}
