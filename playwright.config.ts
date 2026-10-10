import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a production build (`next build && next start`) on port 3100,
 * backed by the dedicated E2E_DATABASE_URL database, which global-setup wipes, migrates and seeds.
 */
const PORT = 3100;
const databaseUrl = process.env.E2E_DATABASE_URL;
if (!databaseUrl) throw new Error("E2E_DATABASE_URL is not set (see .env.example)");
if (databaseUrl === process.env.DATABASE_URL) throw new Error("E2E_DATABASE_URL must differ from DATABASE_URL: E2E runs wipe it.");

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] }, testMatch: /responsive\.spec\.ts/ },
  ],
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    timeout: 300_000,
    reuseExistingServer: false,
    stdout: "ignore",
    stderr: "pipe",
    env: {
      DATABASE_URL: databaseUrl,
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
