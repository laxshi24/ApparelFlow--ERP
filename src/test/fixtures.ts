import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { createOrderHandler } from "@/features/cutting-orders/server/order.handlers";
import { db } from "@/lib/database/client";
import { recipes } from "@/lib/database/schema";
import { call } from "./http";

export async function recipeIdByCode(code: "REC-BL01" | "REC-CT02"): Promise<string> {
  const [r] = await db().select({ id: recipes.id }).from(recipes).where(eq(recipes.recipeCode, code));
  return r.id;
}

export type OrderOverrides = Partial<{
  recipeCode: "REC-BL01" | "REC-CT02";
  targetQty: number;
  fabricRollId: string;
  actualFabricYds: number;
  idempotencyKey: string;
}>;

/** Creates an order through the real HTTP handler as the given (supervisor) session. */
export async function createOrder(cookie: string, overrides: OrderOverrides = {}) {
  const res = await call(createOrderHandler, "POST", "/api/orders", {
    cookie,
    body: {
      recipeId: await recipeIdByCode(overrides.recipeCode ?? "REC-BL01"),
      targetQty: overrides.targetQty ?? 50,
      fabricRollId: overrides.fabricRollId ?? "ROLL-A-001",
      actualFabricYds: overrides.actualFabricYds ?? 95,
      idempotencyKey: overrides.idempotencyKey ?? randomUUID(),
    },
  });
  if (res.status !== 201) throw new Error(`createOrder failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.order as { id: string; orderNo: string; status: string };
}
