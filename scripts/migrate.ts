/** Applies pending SQL migrations. Usage: npm run db:migrate */
import "dotenv/config";
import { runMigrations } from "../src/lib/database/migrate";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env.");
  process.exit(1);
}

runMigrations(url)
  .then(() => console.log("Migrations applied."))
  .catch((err) => {
    console.error("Migration failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
