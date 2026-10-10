import type { SeedPasswords } from "@/lib/database/seed";

/** Distinct per-role passwords for the isolated test database. */
export const TEST_PASSWORDS: SeedPasswords = {
  cutting_supervisor: "Test-Supervisor-Pass1",
  cutting_verifier: "Test-Verifier-Pass1",
  sewing_supervisor: "Test-Sewing-Pass1",
};
