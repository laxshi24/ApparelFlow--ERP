import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./backend/db/schema.ts",
  out: "./backend/db/migrations",
  dbCredentials: { url: process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL || "" },
  strict: true,
  verbose: true,
});
