/**
 * Single source of truth for role-based access control.
 * Enforced on the server by API guards (`requireApiUser`) and page guards (`requirePageUser`).
 * The client uses the same matrix only to decide what to *show*; it is never a security control.
 */
import { USER_ROLES, type UserRole } from "./types";

export const ROLES = USER_ROLES;

export const ROLE_LABELS: Record<UserRole, string> = {
  cutting_supervisor: "Cutting Supervisor",
  cutting_verifier: "Cutting Verifier",
  sewing_supervisor: "Sewing Supervisor",
};

const PERMISSIONS = {
  "recipes:read": ["cutting_supervisor", "cutting_verifier", "sewing_supervisor"],
  "orders:read": ["cutting_supervisor", "cutting_verifier"],
  "orders:create": ["cutting_supervisor"],
  "orders:recut": ["cutting_supervisor"],
  "verification:read": ["cutting_verifier"],
  "verification:count": ["cutting_verifier"],
  "verification:decide": ["cutting_verifier"],
  "sewing:read": ["sewing_supervisor"],
  "sewing:start": ["sewing_supervisor"],
  "audit:read": ["cutting_supervisor", "cutting_verifier"],
} as const satisfies Record<string, readonly UserRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: UserRole, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly UserRole[]).includes(role);
}

/** Landing page after login for each role. */
export const ROLE_HOME: Record<UserRole, string> = {
  cutting_supervisor: "/orders",
  cutting_verifier: "/verification",
  sewing_supervisor: "/sewing",
};

export function isRole(value: unknown): value is UserRole {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
