import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { classifyCount } from "@/domain/traffic-light";
import { recordAuditEvent } from "@/lib/audit/record-event";
import type { SessionUser } from "@/lib/auth/session";
import type { DbExecutor } from "@/lib/database/client";
import { cuttingOrders, verificationItems } from "@/lib/database/schema";
import { BusinessRuleError, NotFoundError, ValidationError } from "@/lib/errors";
import type { CountEntry } from "../schemas/verification.schema";

export type LockedOrder = typeof cuttingOrders.$inferSelect;

/**
 * Locks the order row (SELECT … FOR UPDATE) for the rest of the transaction, so concurrent
 * count/approve/reject requests on the same order are serialised and see each other's results.
 */
export async function lockOrder(tx: DbExecutor, orderId: string): Promise<LockedOrder> {
  const [order] = await tx.select().from(cuttingOrders).where(eq(cuttingOrders.id, orderId)).for("update");
  if (!order) throw new NotFoundError("Cutting order not found");
  return order;
}

export function assertPendingVerification(order: LockedOrder, action: string): void {
  if (order.status !== "PENDING_VERIFICATION") {
    throw new BusinessRuleError(`Cannot ${action}: order ${order.orderNo} is ${order.status}, not PENDING_VERIFICATION`, {
      reason: "INVALID_STATE",
      status: order.status,
    });
  }
}

/**
 * Writes physical counts for the order's current attempt. The traffic-light status is computed
 * here on the server; counted_by/counted_at come from the session and the DB clock.
 */
export async function applyCounts(tx: DbExecutor, user: SessionUser, order: LockedOrder, counts: CountEntry[]): Promise<void> {
  const items = await tx
    .select({ id: verificationItems.id, expectedQty: verificationItems.expectedQty, actualQty: verificationItems.actualQty })
    .from(verificationItems)
    .where(
      and(
        eq(verificationItems.orderId, order.id),
        eq(verificationItems.attemptNo, order.currentAttempt),
        inArray(
          verificationItems.id,
          counts.map((c) => c.itemId),
        ),
      ),
    );
  const byId = new Map(items.map((i) => [i.id, i]));
  const unknown = counts.filter((c) => !byId.has(c.itemId));
  if (unknown.length > 0) {
    throw new ValidationError(
      unknown.map((c) => ({ path: `counts.${c.itemId}`, message: "Item does not belong to this order's current verification attempt" })),
    );
  }

  const changes: { itemId: string; from: number | null; to: number | null }[] = [];
  for (const entry of counts) {
    const item = byId.get(entry.itemId)!;
    if (item.actualQty === entry.actualQty) continue;
    await tx
      .update(verificationItems)
      .set({
        actualQty: entry.actualQty,
        status: classifyCount(item.expectedQty, entry.actualQty),
        countedBy: entry.actualQty === null ? null : user.id,
        countedAt: entry.actualQty === null ? null : sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(eq(verificationItems.id, item.id));
    changes.push({ itemId: item.id, from: item.actualQty, to: entry.actualQty });
  }

  if (changes.length > 0) {
    await recordAuditEvent(tx, {
      type: "COUNTS_RECORDED",
      actorId: user.id,
      orderId: order.id,
      payload: { attemptNo: order.currentAttempt, changes },
    });
  }
}
