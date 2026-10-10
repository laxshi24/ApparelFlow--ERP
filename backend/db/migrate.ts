import { existsSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** SQL migrations live in backend/db/migrations; works whether run from the repo root or frontend/. */
function migrationsFolder(): string {
  const candidates = [path.resolve(process.cwd(), "backend/db/migrations"), path.resolve(process.cwd(), "../backend/db/migrations")];
  const found = candidates.find((dir) => existsSync(path.join(dir, "meta", "_journal.json")));
  if (!found) throw new Error(`Migrations folder not found (looked in: ${candidates.join(", ")})`);
  return found;
}

/** Applies pending SQL migrations from ./drizzle. Shared by `npm run db:migrate` and the test harness. */
export async function runMigrations(url: string): Promise<void> {
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: migrationsFolder() });
  } finally {
    await client.end();
  }
}
