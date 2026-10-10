import "server-only";
import { eq, sql } from "drizzle-orm";
import { getRecipe } from "@backend/services/recipes/recipe.service";
import { lockOrder } from "@backend/services/verification/order-lock";
import { expectedComponentQuantities } from "@shared/domain/quantities";
import { recordAuditEvent } from "@backend/services/audit/record-event";
import type { SessionUser } from "@backend/services/auth/session.service";
import { db } from "@backend/db/client";
import { cuttingOrders, verificationItems } from "@backend/db/schema";
import { BusinessRuleError, ForbiddenError } from "@shared/errors";
import type { RecutInput } from "@shared/validation/recut.schema";

/**
 * Re-cut workflow for a REJECTED batch.
 *  - Opens a NEW verification attempt (attempt + 1) with fresh, uncounted items whose expected
 *    quantities are recomputed from the recipe. Previous attempts' items and their REJECTED log
 *    are left untouched (and are immutable at the database level).
 *  - The order returns to PENDING_VERIFICATION, so it must pass the full gatekeeper again.
 *  - Fabric roll / usage may be updated; the previous values remain in the rejection log snapshot
 *    and in the RECUT_SUBMITTED audit event.
 */
export async function recutOrder(user: SessionUser, orderId: string, input: RecutInput) {
  if (user.role !== "cutting_supervisor") throw new ForbiddenError("Only a Cutting Supervisor can submit a re-cut");
  return db().transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (order.status !== "REJECTED") {
      throw new BusinessRuleError(`Only rejected orders can be re-cut; ${order.orderNo} is ${order.status}`, {
        reason: "INVALID_STATE",
        status: order.status,
      });
    }

    const recipe = await getRecipe(order.recipeId, tx);
    const expected = expectedComponentQuantities(order.targetQty, recipe.components);
    const nextAttempt = order.currentAttempt + 1;

    await tx.insert(verificationItems).values(
      expected.map((c) => ({ orderId: order.id, attemptNo: nextAttempt, componentId: c.id, expectedQty: c.expectedQty })),
    );

    await tx
      .update(cuttingOrders)
      .set({
        status: "PENDING_VERIFICATION",
        currentAttempt: nextAttempt,
        fabricRollId: input.fabricRollId,
        actualFabricYds: input.actualFabricYds,
        updatedAt: sql`now()`,
      })
      .where(eq(cuttingOrders.id, order.id));

    await recordAuditEvent(tx, {
      type: "RECUT_SUBMITTED",
      actorId: user.id,
      orderId: order.id,
      payload: {
        orderNo: order.orderNo,
        previousAttempt: order.currentAttempt,
        newAttempt: nextAttempt,
        note: input.note,
        previous: { fabricRollId: order.fabricRollId, actualFabricYds: order.actualFabricYds },
        current: { fabricRollId: input.fabricRollId, actualFabricYds: input.actualFabricYds },
      },
    });

    return { id: order.id, orderNo: order.orderNo, status: "PENDING_VERIFICATION" as const, currentAttempt: nextAttempt };
  });
}
