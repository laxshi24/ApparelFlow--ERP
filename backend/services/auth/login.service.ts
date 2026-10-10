import "server-only";
import { and, eq, gt, sql } from "drizzle-orm";
import { recordAuditEvent } from "@backend/services/audit/record-event";
import { dummyPasswordHash, verifyPassword } from "@backend/services/auth/password";
import type { SessionUser } from "@backend/services/auth/session.service";
import { db } from "@backend/db/client";
import { auditEvents, users } from "@backend/db/schema";
import { RateLimitedError, UnauthenticatedError } from "@shared/errors";
import type { LoginInput } from "@shared/validation/login.schema";

export const MAX_FAILED_LOGINS = 10;
export const FAILED_LOGIN_WINDOW_MINUTES = 15;

/** Verifies credentials. Uniform error + timing for unknown e-mail vs wrong password. DB-backed throttle. */
export async function authenticate({ email, password }: LoginInput): Promise<SessionUser> {
  const since = new Date(Date.now() - FAILED_LOGIN_WINDOW_MINUTES * 60 * 1000);
  const [{ failures }] = await db()
    .select({ failures: sql<number>`count(*)::int` })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.eventType, "LOGIN_FAILED"),
        gt(auditEvents.occurredAt, since),
        sql`${auditEvents.payload}->>'email' = ${email}`,
      ),
    );
  if (failures >= MAX_FAILED_LOGINS) throw new RateLimitedError();

  const [user] = await db().select().from(users).where(eq(users.email, email)).limit(1);
  const ok = await verifyPassword(user?.passwordHash ?? (await dummyPasswordHash()), password);

  if (!user || !ok) {
    await recordAuditEvent(db(), { type: "LOGIN_FAILED", actorId: null, payload: { email } });
    throw new UnauthenticatedError("Invalid email or password");
  }

  await recordAuditEvent(db(), { type: "LOGIN_SUCCEEDED", actorId: user.id, payload: { email } });
  return { id: user.id, email: user.email, fullName: user.fullName, role: user.role };
}
