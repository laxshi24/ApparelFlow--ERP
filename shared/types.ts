/**
 * Domain enumerations shared by the frontend, the backend and the database schema
 * (the PostgreSQL enums in backend/db/schema.ts are generated from these lists).
 */
export const USER_ROLES = ["cutting_supervisor", "cutting_verifier", "sewing_supervisor"] as const;
export const ORDER_STATUSES = ["PENDING_VERIFICATION", "VERIFIED", "REJECTED"] as const;
export const COMPONENT_STATUSES = ["GREEN", "YELLOW", "RED"] as const;
export const VERIFICATION_DECISIONS = ["APPROVED", "REJECTED"] as const;

export type UserRole = (typeof USER_ROLES)[number];
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type ComponentStatus = (typeof COMPONENT_STATUSES)[number];
export type VerificationDecision = (typeof VERIFICATION_DECISIONS)[number];
