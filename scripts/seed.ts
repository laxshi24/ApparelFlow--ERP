/** Idempotent seed of recipes and demo users. Usage: npm run db:seed */
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/lib/database/schema";
import { DEMO_USERS, runSeed } from "../src/lib/database/seed";

async function main() {
  const url = process.env.DATABASE_URL;
  const demoPassword = process.env.DEMO_PASSWORD;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.");
  if (!demoPassword) throw new Error("DEMO_PASSWORD is not set. It is required to create the demo accounts.");

  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await runSeed(drizzle(client, { schema }), { demoPassword });
    console.log("Seed complete. Demo accounts:");
    for (const u of DEMO_USERS) console.log(`  ${u.role.padEnd(20)} ${u.email}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Seed failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
