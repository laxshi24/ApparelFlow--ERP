import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "@shared/validation/login.schema";
import { can } from "@shared/permissions";

describe("safeRedirectPath", () => {
  it.each(["/orders", "/verification/abc?x=1"])("accepts %s", (p) => expect(safeRedirectPath(p)).toBe(p));
  it.each(["//evil.com", "https://evil.com", "/\\evil.com", "orders", "/api/auth/me", null, 42])("rejects %s", (p) =>
    expect(safeRedirectPath(p)).toBeNull(),
  );
});

describe("permission matrix", () => {
  it("only verifiers can decide verifications", () => {
    expect(can("cutting_verifier", "verification:decide")).toBe(true);
    expect(can("cutting_supervisor", "verification:decide")).toBe(false);
    expect(can("sewing_supervisor", "verification:decide")).toBe(false);
  });
  it("only sewing supervisors can access the sewing queue", () => {
    expect(can("sewing_supervisor", "sewing:read")).toBe(true);
    expect(can("cutting_supervisor", "sewing:read")).toBe(false);
    expect(can("cutting_verifier", "sewing:read")).toBe(false);
  });
  it("only cutting supervisors can create orders", () => {
    expect(can("cutting_supervisor", "orders:create")).toBe(true);
    expect(can("cutting_verifier", "orders:create")).toBe(false);
    expect(can("sewing_supervisor", "orders:create")).toBe(false);
  });
});
