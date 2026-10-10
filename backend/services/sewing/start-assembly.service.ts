import "server-only";
import { and, eq } from "drizzle-orm";
import { recordAuditEvent } from "@backend/services/audit/record-event";
import type { SessionUser } from "@backend/services/auth/session.service";
import { db } from "@backend/db/client";
import { cuttingOrders, sewingOperations } from "@backend/db/schema";
import { ForbiddenError, NotFoundError } from "@shared/errors";

export type StartAssemblyResult = { orderId: string; orderNo: string; startedAt: Date; startedBy: string; alreadyStarted: boolean };

/**
 * Starts sewing assembly for a VERIFIED batch. Idempotent: a repeated or concurrent request
 * returns the existing operation (UNIQUE(order_id) + ON CONFLICT DO NOTHING) and records no
 * second audit event. The order's VERIFIED status is never modified — sewing state lives in
 * its own table, so the verification fact remains intact.
 */
export async function startAssembly(user: SessionUser, orderId: string): Promise<StartAssemblyResult> {
  if (user.role !== "sewing_supervisor") throw new ForbiddenError("Only a Sewing Supervisor can start assembly");
  return db().transaction(async (tx) => {
    const [order] = await tx
      .select({ id: cuttingOrders.id, orderNo: cuttingOrders.orderNo })
      .from(cuttingOrders)
      .where(and(eq(cuttingOrders.id, orderId), eq(cuttingOrders.status, "VERIFIED")))
      .for("share");
    if (!order) throw new NotFoundError("Verified batch not found");

    const [created] = await tx
      .insert(sewingOperations)
      .values({ orderId: order.id, startedBy: user.id })
      .onConflictDoNothing({ target: sewingOperations.orderId })
      .returning();

    if (created) {
      await recordAuditEvent(tx, {
        type: "SEWING_STARTED",
        actorId: user.id,
        orderId: order.id,
        payload: { orderNo: order.orderNo, sewingOperationId: created.id },
      });
      return { orderId: order.id, orderNo: order.orderNo, startedAt: created.startedAt, startedBy: user.id, alreadyStarted: false };
    }

    const [existing] = await tx.select().from(sewingOperations).where(eq(sewingOperations.orderId, order.id));
    return { orderId: order.id, orderNo: order.orderNo, startedAt: existing.startedAt, startedBy: existing.startedBy, alreadyStarted: true };
  });
}
