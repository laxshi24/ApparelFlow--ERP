import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/database/client";
import { cuttingOrders, recipes, users, verificationItems } from "@/lib/database/schema";

export type PendingOrderRow = {
  id: string;
  orderNo: string;
  recipeCode: string;
  recipeName: string;
  targetQty: number;
  currentAttempt: number;
  createdByName: string;
  createdAt: Date;
  itemCount: number;
  countedCount: number;
  shortCount: number;
};

/** Orders awaiting verification, oldest first (FIFO), with counting progress for the current attempt. */
export async function listPendingVerification(): Promise<PendingOrderRow[]> {
  return db()
    .select({
      id: cuttingOrders.id,
      orderNo: cuttingOrders.orderNo,
      recipeCode: recipes.recipeCode,
      recipeName: recipes.name,
      targetQty: cuttingOrders.targetQty,
      currentAttempt: cuttingOrders.currentAttempt,
      createdByName: users.fullName,
      createdAt: cuttingOrders.createdAt,
      itemCount: sql<number>`count(${verificationItems.id})::int`,
      countedCount: sql<number>`count(${verificationItems.actualQty})::int`,
      shortCount: sql<number>`count(*) filter (where ${verificationItems.status} = 'RED')::int`,
    })
    .from(cuttingOrders)
    .innerJoin(recipes, eq(recipes.id, cuttingOrders.recipeId))
    .innerJoin(users, eq(users.id, cuttingOrders.createdBy))
    .leftJoin(
      verificationItems,
      and(eq(verificationItems.orderId, cuttingOrders.id), eq(verificationItems.attemptNo, cuttingOrders.currentAttempt)),
    )
    .where(eq(cuttingOrders.status, "PENDING_VERIFICATION"))
    .groupBy(cuttingOrders.id, recipes.id, users.id)
    .orderBy(asc(cuttingOrders.createdAt));
}
