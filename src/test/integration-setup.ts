/**
 * Runs in every integration-test worker before test modules load:
 * points the app at the isolated test database prepared by global-setup.
 */
import "dotenv/config";
import { afterAll } from "vitest";
import { closeDb } from "@/lib/database/client";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.DATABASE_POOL_MAX = "10";

afterAll(async () => {
  await closeDb();
});
