/** Idempotent seed of the production recipes and the three user accounts. Usage: npm run db:seed */
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/lib/database/schema";
import { runSeed, SEED_USERS, type SeedPasswords } from "../src/lib/database/seed";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (see .env.example).`);
  return value;
}

async function main() {
  const url = process.env.MIGRATION_DATABASE_URL || required("DATABASE_URL");
  const passwords: SeedPasswords = {
    cutting_supervisor: required("SEED_SUPERVISOR_PASSWORD"),
    cutting_verifier: required("SEED_VERIFIER_PASSWORD"),
    sewing_supervisor: required("SEED_SEWING_PASSWORD"),
  };

  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await runSeed(drizzle(client, { schema }), { passwords });
    console.log("Seed complete. Accounts:");
    for (const u of SEED_USERS) console.log(`  ${u.role.padEnd(20)} ${u.email}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Seed failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
