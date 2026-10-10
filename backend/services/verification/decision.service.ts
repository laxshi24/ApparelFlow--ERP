import "server-only";
import { eq, sql } from "drizzle-orm";
import { getAttemptItems } from "@backend/services/orders/order-queries.service";
import { getRecipe } from "@backend/services/recipes/recipe.service";
import { assessApproval, classifyCount } from "@shared/domain/traffic-light";
import { calculateWastage } from "@shared/domain/wastage";
import { recordAuditEvent } from "@backend/services/audit/record-event";
import type { SessionUser } from "@backend/services/auth/session.service";
import { db, type DbExecutor } from "@backend/db/client";
import { cuttingOrders, verificationLogs, type ComponentVarianceSnapshot } from "@backend/db/schema";
import { BusinessRuleError, ForbiddenError } from "@shared/errors";
import type { CountEntry } from "@shared/validation/verification.schema";
import { applyCounts, assertPendingVerification, lockOrder, type LockedOrder } from "@backend/services/verification/order-lock";

export type DecisionResult = {
  orderId: string;
  orderNo: string;
  status: "VERIFIED" | "REJECTED";
  logId: string;
  attemptNo: number;
  verifierId: string;
  timestamp: Date;
  wastagePct: number;
};

/** Defence in depth: the use cases re-check the role even though handlers already did. */
function assertVerifier(user: SessionUser) {
  if (user.role !== "cutting_verifier") throw new ForbiddenError("Only a Cutting Verifier can approve or reject batches");
}

/** Builds the immutable snapshot (current attempt items + recipe-derived wastage) inside the locked transaction. */
async function snapshot(tx: DbExecutor, order: LockedOrder) {
  const recipe = await getRecipe(order.recipeId, tx);
  const items = await getAttemptItems(order.id, order.currentAttempt, tx);
  const variances: ComponentVarianceSnapshot[] = items.map((i) => ({
    componentId: i.componentId,
    componentName: i.componentName,
    piecesPerGarment: i.piecesPerGarment,
    expectedQty: i.expectedQty,
    actualQty: i.actualQty,
    variance: i.actualQty === null ? null : i.actualQty - i.expectedQty,
    // Recomputed from the raw numbers rather than trusting the stored status column.
    status: classifyCount(i.expectedQty, i.actualQty),
  }));
  const wastage = calculateWastage({
    targetQty: order.targetQty,
    stdFabricYards: recipe.stdFabricYards,
    actualFabricYds: order.actualFabricYds,
    wastageCapPct: recipe.wastageCap,
  });
  return { recipe, items, variances, wastage };
}

async function writeDecision(
  tx: DbExecutor,
  user: SessionUser,
  order: LockedOrder,
  decision: "APPROVED" | "REJECTED",
  data: Awaited<ReturnType<typeof snapshot>>,
  rejectionNote: string | null,
): Promise<DecisionResult> {
  const [log] = await tx
    .insert(verificationLogs)
    .values({
      orderId: order.id,
      attemptNo: order.currentAttempt,
      verifierId: user.id, // from the authenticated session — never from the request body
      decision,
      rejectionNote,
      expectedFabricYds: data.wastage.expectedFabricYds,
      actualFabricYds: data.wastage.actualFabricYds,
      wastagePct: data.wastage.wastagePct,
      wastageCapPct: data.recipe.wastageCap,
      fabricRollId: order.fabricRollId,
      componentVariances: data.variances,
      // `timestamp` defaults to the database's now(): server-generated, never client-supplied.
    })
    .returning({ id: verificationLogs.id, timestamp: verificationLogs.timestamp });

  const status = decision === "APPROVED" ? "VERIFIED" : "REJECTED";
  await tx.update(cuttingOrders).set({ status, updatedAt: sql`now()` }).where(eq(cuttingOrders.id, order.id));

  await recordAuditEvent(tx, {
    type: decision === "APPROVED" ? "ORDER_APPROVED" : "ORDER_REJECTED",
    actorId: user.id,
    orderId: order.id,
    payload: {
      orderNo: order.orderNo,
      attemptNo: order.currentAttempt,
      verificationLogId: log.id,
      wastagePct: data.wastage.wastagePct,
      ...(rejectionNote && { reason: rejectionNote }),
    },
  });

  return {
    orderId: order.id,
    orderNo: order.orderNo,
    status,
    logId: log.id,
    attemptNo: order.currentAttempt,
    verifierId: user.id,
    timestamp: log.timestamp,
    wastagePct: data.wastage.wastagePct,
  };
}

/**
 * APPROVAL GATEKEEPER. In one transaction with the order row locked:
 *  verifier role → order exists → PENDING_VERIFICATION → (optional on-screen counts saved) →
 *  every recipe component has an item for this attempt → every item counted → no shortage →
 *  wastage computable → APPROVED log + VERIFIED transition + audit event.
 * Any failure throws and rolls back everything, including counts sent with the request.
 */
export async function approveOrder(user: SessionUser, orderId: string, counts?: CountEntry[]): Promise<DecisionResult> {
  assertVerifier(user);
  return db().transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    assertPendingVerification(order, "approve");
    if (counts) await applyCounts(tx, user, order, counts);

    const data = await snapshot(tx, order);

    const itemComponentIds = new Set(data.items.map((i) => i.componentId));
    const withoutRecord = data.recipe.components.filter((c) => !itemComponentIds.has(c.id)).map((c) => c.componentName);
    if (withoutRecord.length > 0 || data.items.length === 0) {
      throw new BusinessRuleError("Cannot approve: some recipe components have no verification record", {
        reason: "MISSING_COMPONENT_RECORDS",
        components: withoutRecord,
      });
    }

    const assessment = assessApproval(data.items);
    if (assessment.missing.length > 0) {
      throw new BusinessRuleError(`Cannot approve: ${assessment.missing.length} component(s) have not been counted`, {
        reason: "INCOMPLETE_COUNTS",
        missing: assessment.missing,
      });
    }
    if (assessment.shortages.length > 0) {
      throw new BusinessRuleError(`Cannot approve: ${assessment.shortages.length} component(s) are short (RED)`, {
        reason: "SHORTAGE",
        shortages: assessment.shortages,
      });
    }

    return writeDecision(tx, user, order, "APPROVED", data, null);
  });
}

/** Rejects a pending batch with a mandatory reason. Counts may be partial; the snapshot records what was counted. */
export async function rejectOrder(user: SessionUser, orderId: string, reason: string, counts?: CountEntry[]): Promise<DecisionResult> {
  assertVerifier(user);
  const note = reason.trim();
  if (note.length < 5) throw new BusinessRuleError("A rejection reason is required", { reason: "MISSING_REASON" });
  return db().transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    assertPendingVerification(order, "reject");
    if (counts) await applyCounts(tx, user, order, counts);
    const data = await snapshot(tx, order);
    return writeDecision(tx, user, order, "REJECTED", data, note);
  });
}

/** Saves counts without deciding (verification terminal autosave). */
export async function saveCounts(user: SessionUser, orderId: string, counts: CountEntry[]): Promise<void> {
  if (user.role !== "cutting_verifier") throw new ForbiddenError();
  await db().transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    assertPendingVerification(order, "record counts");
    await applyCounts(tx, user, order, counts);
  });
}
