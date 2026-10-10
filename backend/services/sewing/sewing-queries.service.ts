import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getOrderDetail, type OrderDetail } from "@backend/services/orders/order-queries.service";
import { db } from "@backend/db/client";
import { cuttingOrders, recipes, sewingOperations, users, verificationLogs } from "@backend/db/schema";
import { NotFoundError } from "@shared/errors";

export type SewingQueueRow = {
  id: string;
  orderNo: string;
  recipeCode: string;
  recipeName: string;
  targetQty: number;
  verifiedAt: Date;
  verifierName: string;
  wastagePct: number;
  wastageCapPct: number;
  sewingStartedAt: Date | null;
  sewingStartedByName: string | null;
};

const verifier = alias(users, "verifier");
const starter = alias(users, "starter");

/**
 * The Sewing Queue. The VERIFIED filter is part of the SQL WHERE clause (not applied in
 * JavaScript and not driven by request parameters), so pending, rejected or re-cut batches
 * can never be returned. The APPROVED log is joined on the order's current attempt.
 */
export async function listSewingQueue(): Promise<SewingQueueRow[]> {
  return db()
    .select({
      id: cuttingOrders.id,
      orderNo: cuttingOrders.orderNo,
      recipeCode: recipes.recipeCode,
      recipeName: recipes.name,
      targetQty: cuttingOrders.targetQty,
      verifiedAt: verificationLogs.timestamp,
      verifierName: verifier.fullName,
      wastagePct: verificationLogs.wastagePct,
      wastageCapPct: verificationLogs.wastageCapPct,
      sewingStartedAt: sewingOperations.startedAt,
      sewingStartedByName: starter.fullName,
    })
    .from(cuttingOrders)
    .innerJoin(recipes, eq(recipes.id, cuttingOrders.recipeId))
    .innerJoin(
      verificationLogs,
      and(
        eq(verificationLogs.orderId, cuttingOrders.id),
        eq(verificationLogs.attemptNo, cuttingOrders.currentAttempt),
        eq(verificationLogs.decision, "APPROVED"),
      ),
    )
    .innerJoin(verifier, eq(verifier.id, verificationLogs.verifierId))
    .leftJoin(sewingOperations, eq(sewingOperations.orderId, cuttingOrders.id))
    .leftJoin(starter, eq(starter.id, sewingOperations.startedBy))
    .where(eq(cuttingOrders.status, "VERIFIED"))
    .orderBy(desc(verificationLogs.timestamp));
}

/** Detail of a verified batch. Any other status is reported as not found (no existence leak). */
export async function getSewingOrder(orderId: string): Promise<OrderDetail> {
  const [row] = await db()
    .select({ id: cuttingOrders.id })
    .from(cuttingOrders)
    .where(and(eq(cuttingOrders.id, orderId), eq(cuttingOrders.status, "VERIFIED")))
    .limit(1);
  if (!row) throw new NotFoundError("Verified batch not found");
  return getOrderDetail(row.id);
}
