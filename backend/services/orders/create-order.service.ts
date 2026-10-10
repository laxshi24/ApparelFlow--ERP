import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getRecipe } from "@backend/services/recipes/recipe.service";
import { expectedComponentQuantities } from "@shared/domain/quantities";
import { recordAuditEvent } from "@backend/services/audit/record-event";
import type { SessionUser } from "@backend/services/auth/session.service";
import { db } from "@backend/db/client";
import { cuttingOrders, verificationItems } from "@backend/db/schema";
import { ConflictError, NotFoundError, ValidationError } from "@shared/errors";
import type { CreateOrderInput } from "@shared/validation/order.schema";

export type CreatedOrder = { id: string; orderNo: string; status: string; created: boolean };

/**
 * Creates a cutting order in PENDING_VERIFICATION together with its attempt-1 verification
 * items. Expected counts are computed here from the database recipe. Idempotent per
 * (supervisor, idempotencyKey): a replay returns the original order instead of a duplicate.
 */
export async function createCuttingOrder(user: SessionUser, input: CreateOrderInput): Promise<CreatedOrder> {
  return db().transaction(async (tx) => {
    const recipe = await getRecipe(input.recipeId, tx).catch((err) => {
      if (err instanceof NotFoundError) throw new ValidationError([{ path: "recipeId", message: "Selected recipe does not exist" }]);
      throw err;
    });
    if (recipe.components.length === 0) {
      throw new ValidationError([{ path: "recipeId", message: "Recipe has no components to verify" }]);
    }
    const expected = expectedComponentQuantities(input.targetQty, recipe.components);

    const [order] = await tx
      .insert(cuttingOrders)
      .values({
        orderNo: sql`'CO-' || to_char(now() AT TIME ZONE 'UTC', 'YYYY') || '-' || lpad(nextval('cutting_order_no_seq')::text, 6, '0')`,
        recipeId: recipe.id,
        targetQty: input.targetQty,
        fabricRollId: input.fabricRollId,
        actualFabricYds: input.actualFabricYds,
        createdBy: user.id,
        idempotencyKey: input.idempotencyKey,
      })
      .onConflictDoNothing({ target: [cuttingOrders.createdBy, cuttingOrders.idempotencyKey] })
      .returning({ id: cuttingOrders.id, orderNo: cuttingOrders.orderNo, status: cuttingOrders.status });

    if (!order) {
      // Duplicate submission (double click, retry after timeout): return the original order.
      const [existing] = await tx
        .select()
        .from(cuttingOrders)
        .where(and(eq(cuttingOrders.createdBy, user.id), eq(cuttingOrders.idempotencyKey, input.idempotencyKey)));
      const samePayload =
        existing.recipeId === input.recipeId &&
        existing.targetQty === input.targetQty &&
        existing.fabricRollId === input.fabricRollId &&
        existing.actualFabricYds === input.actualFabricYds;
      if (!samePayload) throw new ConflictError("This submission key was already used for a different order");
      return { id: existing.id, orderNo: existing.orderNo, status: existing.status, created: false };
    }

    await tx.insert(verificationItems).values(
      expected.map((c) => ({ orderId: order.id, attemptNo: 1, componentId: c.id, expectedQty: c.expectedQty })),
    );

    await recordAuditEvent(tx, {
      type: "ORDER_CREATED",
      actorId: user.id,
      orderId: order.id,
      payload: {
        orderNo: order.orderNo,
        recipeCode: recipe.recipeCode,
        targetQty: input.targetQty,
        fabricRollId: input.fabricRollId,
        actualFabricYds: input.actualFabricYds,
        expected: expected.map((c) => ({ component: c.componentName, expectedQty: c.expectedQty })),
      },
    });

    return { ...order, created: true };
  });
}
