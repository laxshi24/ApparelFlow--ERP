import "server-only";
import type { DbExecutor } from "@backend/db/client";
import { auditEvents, type AuditEventType } from "@backend/db/schema";

/**
 * Appends an immutable audit event. Pass the transaction handle so the event commits
 * (or rolls back) together with the state change it describes. Actor ids always come
 * from the authenticated server session, never from request bodies.
 */
export async function recordAuditEvent(
  executor: DbExecutor,
  event: { type: AuditEventType; actorId: string | null; orderId?: string | null; payload?: Record<string, unknown> },
): Promise<void> {
  await executor.insert(auditEvents).values({
    eventType: event.type,
    actorId: event.actorId,
    orderId: event.orderId ?? null,
    payload: event.payload ?? {},
  });
}
