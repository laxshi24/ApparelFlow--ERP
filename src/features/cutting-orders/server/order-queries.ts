import "server-only";
import { and, asc, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { calculateWastage } from "@/domain/wastage";
import { db, type DbExecutor } from "@/lib/database/client";
import {
  cuttingOrders,
  recipeComponents,
  recipes,
  sewingOperations,
  users,
  verificationItems,
  verificationLogs,
  type ComponentStatus,
  type ComponentVarianceSnapshot,
  type OrderStatus,
} from "@/lib/database/schema";
import { NotFoundError } from "@/lib/errors";
import { ORDER_PAGE_SIZE, type ListOrdersQuery } from "../schemas/order.schema";

export type OrderListRow = {
  id: string;
  orderNo: string;
  status: OrderStatus;
  currentAttempt: number;
  recipeCode: string;
  recipeName: string;
  targetQty: number;
  fabricRollId: string;
  actualFabricYds: number;
  createdByName: string;
  createdAt: Date;
};

export type OrderItem = {
  id: string;
  componentId: string;
  componentName: string;
  piecesPerGarment: number;
  expectedQty: number;
  actualQty: number | null;
  status: ComponentStatus | null;
  countedAt: Date | null;
};

export type OrderDecision = {
  id: string;
  attemptNo: number;
  decision: "APPROVED" | "REJECTED";
  rejectionNote: string | null;
  verifierId: string;
  verifierName: string;
  timestamp: Date;
  expectedFabricYds: number;
  actualFabricYds: number;
  wastagePct: number;
  wastageCapPct: number;
  fabricRollId: string;
  componentVariances: ComponentVarianceSnapshot[];
};

export type OrderDetail = {
  id: string;
  orderNo: string;
  status: OrderStatus;
  currentAttempt: number;
  targetQty: number;
  fabricRollId: string;
  actualFabricYds: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: { id: string; fullName: string };
  recipe: { id: string; recipeCode: string; name: string; category: string; stdFabricYards: number; wastageCap: number };
  fabric: { expectedFabricYds: number; wastagePct: number; exceedsCap: boolean };
  items: OrderItem[];
  decisions: OrderDecision[];
  sewing: { status: "IN_PROGRESS"; startedAt: Date; startedByName: string } | null;
};

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function listOrders(
  query: ListOrdersQuery,
): Promise<{ orders: OrderListRow[]; total: number; page: number; pageSize: number }> {
  const filters: SQL[] = [];
  if (query.status) filters.push(eq(cuttingOrders.status, query.status));
  if (query.q) {
    const term = `%${escapeLike(query.q)}%`;
    filters.push(
      or(
        ilike(cuttingOrders.orderNo, term),
        ilike(cuttingOrders.fabricRollId, term),
        ilike(recipes.recipeCode, term),
        ilike(recipes.name, term),
      )!,
    );
  }
  const where = filters.length ? and(...filters) : undefined;

  const [{ total }] = await db()
    .select({ total: count() })
    .from(cuttingOrders)
    .innerJoin(recipes, eq(recipes.id, cuttingOrders.recipeId))
    .where(where);

  const orders = await db()
    .select({
      id: cuttingOrders.id,
      orderNo: cuttingOrders.orderNo,
      status: cuttingOrders.status,
      currentAttempt: cuttingOrders.currentAttempt,
      recipeCode: recipes.recipeCode,
      recipeName: recipes.name,
      targetQty: cuttingOrders.targetQty,
      fabricRollId: cuttingOrders.fabricRollId,
      actualFabricYds: cuttingOrders.actualFabricYds,
      createdByName: users.fullName,
      createdAt: cuttingOrders.createdAt,
    })
    .from(cuttingOrders)
    .innerJoin(recipes, eq(recipes.id, cuttingOrders.recipeId))
    .innerJoin(users, eq(users.id, cuttingOrders.createdBy))
    .where(where)
    .orderBy(desc(cuttingOrders.createdAt), desc(cuttingOrders.orderNo))
    .limit(ORDER_PAGE_SIZE)
    .offset((query.page - 1) * ORDER_PAGE_SIZE);

  return { orders, total, page: query.page, pageSize: ORDER_PAGE_SIZE };
}

const creator = alias(users, "creator");
const verifier = alias(users, "verifier");
const sewingStarter = alias(users, "sewing_starter");

/** Verification items of one attempt, in recipe order. */
export async function getAttemptItems(orderId: string, attemptNo: number, executor: DbExecutor = db()): Promise<OrderItem[]> {
  return executor
    .select({
      id: verificationItems.id,
      componentId: verificationItems.componentId,
      componentName: recipeComponents.componentName,
      piecesPerGarment: recipeComponents.piecesPerGarment,
      expectedQty: verificationItems.expectedQty,
      actualQty: verificationItems.actualQty,
      status: verificationItems.status,
      countedAt: verificationItems.countedAt,
    })
    .from(verificationItems)
    .innerJoin(recipeComponents, eq(recipeComponents.id, verificationItems.componentId))
    .where(and(eq(verificationItems.orderId, orderId), eq(verificationItems.attemptNo, attemptNo)))
    .orderBy(asc(recipeComponents.sortOrder), asc(recipeComponents.componentName));
}

/** Full read model of one order. Callers are responsible for authorising access. */
export async function getOrderDetail(orderId: string): Promise<OrderDetail> {
  const [row] = await db()
    .select({
      order: cuttingOrders,
      recipe: {
        id: recipes.id,
        recipeCode: recipes.recipeCode,
        name: recipes.name,
        category: recipes.category,
        stdFabricYards: recipes.stdFabricYards,
        wastageCap: recipes.wastageCap,
      },
      creatorName: creator.fullName,
    })
    .from(cuttingOrders)
    .innerJoin(recipes, eq(recipes.id, cuttingOrders.recipeId))
    .innerJoin(creator, eq(creator.id, cuttingOrders.createdBy))
    .where(eq(cuttingOrders.id, orderId))
    .limit(1);
  if (!row) throw new NotFoundError("Cutting order not found");
  const { order, recipe } = row;

  const [items, decisions, [sewing]] = await Promise.all([
    getAttemptItems(order.id, order.currentAttempt),
    db()
      .select({
        id: verificationLogs.id,
        attemptNo: verificationLogs.attemptNo,
        decision: verificationLogs.decision,
        rejectionNote: verificationLogs.rejectionNote,
        verifierId: verificationLogs.verifierId,
        verifierName: verifier.fullName,
        timestamp: verificationLogs.timestamp,
        expectedFabricYds: verificationLogs.expectedFabricYds,
        actualFabricYds: verificationLogs.actualFabricYds,
        wastagePct: verificationLogs.wastagePct,
        wastageCapPct: verificationLogs.wastageCapPct,
        fabricRollId: verificationLogs.fabricRollId,
        componentVariances: verificationLogs.componentVariances,
      })
      .from(verificationLogs)
      .innerJoin(verifier, eq(verifier.id, verificationLogs.verifierId))
      .where(eq(verificationLogs.orderId, order.id))
      .orderBy(asc(verificationLogs.attemptNo)),
    db()
      .select({ status: sewingOperations.status, startedAt: sewingOperations.startedAt, startedByName: sewingStarter.fullName })
      .from(sewingOperations)
      .innerJoin(sewingStarter, eq(sewingStarter.id, sewingOperations.startedBy))
      .where(eq(sewingOperations.orderId, order.id)),
  ]);

  const { expectedFabricYds, wastagePct, exceedsCap } = calculateWastage({
    targetQty: order.targetQty,
    stdFabricYards: recipe.stdFabricYards,
    actualFabricYds: order.actualFabricYds,
    wastageCapPct: recipe.wastageCap,
  });

  return {
    id: order.id,
    orderNo: order.orderNo,
    status: order.status,
    currentAttempt: order.currentAttempt,
    targetQty: order.targetQty,
    fabricRollId: order.fabricRollId,
    actualFabricYds: order.actualFabricYds,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    createdBy: { id: order.createdBy, fullName: row.creatorName },
    recipe,
    fabric: { expectedFabricYds, wastagePct, exceedsCap },
    items,
    decisions,
    sewing: sewing ?? null,
  };
}
