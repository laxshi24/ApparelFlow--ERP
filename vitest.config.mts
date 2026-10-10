import path from "node:path";
import { defineConfig } from "vitest/config";

const alias = {
  "@frontend": path.resolve(import.meta.dirname, "frontend"),
  "@backend": path.resolve(import.meta.dirname, "backend"),
  "@shared": path.resolve(import.meta.dirname, "shared"),
  "server-only": path.resolve(import.meta.dirname, "backend/tests/helpers/server-only-stub.ts"),
};

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment: "node",
          include: ["backend/tests/unit/**/*.unit.test.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          environment: "node",
          include: ["backend/tests/integration/**/*.int.test.ts"],
          globalSetup: ["backend/tests/helpers/global-setup.ts"],
          setupFiles: ["backend/tests/helpers/integration-setup.ts"],
          // One shared PostgreSQL test database: run files serially for deterministic state.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
