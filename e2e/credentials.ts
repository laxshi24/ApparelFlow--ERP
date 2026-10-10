import type { SeedPasswords } from "../backend/db/seed";

/** Per-role passwords seeded into the throwaway E2E database. */
export const E2E_PASSWORDS: SeedPasswords = {
  cutting_supervisor: "E2E-Supervisor-Pass1",
  cutting_verifier: "E2E-Verifier-Pass1",
  sewing_supervisor: "E2E-Sewing-Pass1",
};
