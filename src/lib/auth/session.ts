import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { db } from "@/lib/database/client";
import { sessions, users, type UserRole } from "@/lib/database/schema";
import { env } from "@/lib/env";

export const SESSION_COOKIE = "af_session";

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
};

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}

/** Creates a server-side session. Only the SHA-256 of the token is stored. */
export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + env().SESSION_TTL_HOURS * 60 * 60 * 1000);
  await db().insert(sessions).values({ id: hashToken(token), userId, expiresAt });
  // Opportunistic cleanup of this user's expired sessions.
  await db()
    .delete(sessions)
    .where(and(eq(sessions.userId, userId), lt(sessions.expiresAt, sql`now()`)));
  return { token, expiresAt };
}

/** Resolves the user for a session token; the role always comes from the database, never the client. */
export async function validateSessionToken(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token || token.length > 128) return null;
  const [row] = await db()
    .select({ id: users.id, email: users.email, fullName: users.fullName, role: users.role })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, sql`now()`)))
    .limit(1);
  return row ?? null;
}

export async function revokeSession(token: string | undefined | null): Promise<void> {
  if (!token) return;
  await db().delete(sessions).where(eq(sessions.id, hashToken(token)));
}
