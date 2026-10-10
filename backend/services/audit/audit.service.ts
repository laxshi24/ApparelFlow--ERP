import "server-only";
import { asc, count, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@backend/db/client";
import {
  auditEvents,
  cuttingOrders,
  recipes,
  sewingOperations,
  users,
  verificationLogs,
  type AuditEventType,
  type OrderStatus,
} from "@backend/db/schema";

export type TimelineEvent = {
  id: string;
  eventType: AuditEventType;
  actorName: string | null;
  actorRole: string | null;
  occurredAt: Date;
  payload: Record<string, unknown>;
};

/** Chronological, append-only history of one order (creation, counts, decisions, re-cuts, sewing). */
export async function getOrderTimeline(orderId: string): Promise<TimelineEvent[]> {
  return db()
    .select({
      id: auditEvents.id,
      eventType: auditEvents.eventType,
      actorName: users.fullName,
      actorRole: users.role,
      occurredAt: auditEvents.occurredAt,
      payload: auditEvents.payload,
    })
    .from(auditEvents)
    .leftJoin(users, eq(users.id, auditEvents.actorId))
    .where(eq(auditEvents.orderId, orderId))
    .orderBy(asc(auditEvents.seq));
}

export type DecisionLogRow = {
  id: string;
  orderId: string;
  orderNo: string;
  recipeCode: string;
  attemptNo: number;
  decision: "APPROVED" | "REJECTED";
  rejectionNote: string | null;
  verifierName: string;
  timestamp: Date;
  wastagePct: number;
  wastageCapPct: number;
};

export const DECISION_PAGE_SIZE = 25;

const verifier = alias(users, "verifier");

export async function listDecisions(page: number): Promise<{ rows: DecisionLogRow[]; total: number; page: number; pageSize: number }> {
  const [{ total }] = await db().select({ total: count() }).from(verificationLogs);
  const rows = await db()
    .select({
      id: verificationLogs.id,
      orderId: cuttingOrders.id,
      orderNo: cuttingOrders.orderNo,
      recipeCode: recipes.recipeCode,
      attemptNo: verificationLogs.attemptNo,
      decision: verificationLogs.decision,
      rejectionNote: verificationLogs.rejectionNote,
      verifierName: verifier.fullName,
      timestamp: verificationLogs.timestamp,
      wastagePct: verificationLogs.wastagePct,
      wastageCapPct: verificationLogs.wastageCapPct,
    })
    .from(verificationLogs)
    .innerJoin(cuttingOrders, eq(cuttingOrders.id, verificationLogs.orderId))
    .innerJoin(recipes, eq(recipes.id, cuttingOrders.recipeId))
    .innerJoin(verifier, eq(verifier.id, verificationLogs.verifierId))
    .orderBy(desc(verificationLogs.timestamp), desc(verificationLogs.id))
    .limit(DECISION_PAGE_SIZE)
    .offset((page - 1) * DECISION_PAGE_SIZE);
  return { rows, total, page, pageSize: DECISION_PAGE_SIZE };
}

export type AuditSummary = {
  ordersByStatus: Record<OrderStatus, number>;
  approvals: number;
  rejections: number;
  /** Share of verified orders approved on their first attempt (no rejection). */
  firstPassRatePct: number | null;
  sewingStarted: number;
  wastageByRecipe: {
    recipeCode: string;
    recipeName: string;
    wastageCapPct: number;
    approvedBatches: number;
    avgWastagePct: number | null;
    maxWastagePct: number | null;
    overCapBatches: number;
  }[];
};

/**
 * Reporting figures computed from the immutable decision snapshots (wastage as recorded at
 * approval time), so they agree with what the verifier saw and never drift if a recipe changes.
 */
export async function getAuditSummary(): Promise<AuditSummary> {
  const [statusRows, [decisions], [firstPass], [sewing], wastage] = await Promise.all([
    db().select({ status: cuttingOrders.status, n: count() }).from(cuttingOrders).groupBy(cuttingOrders.status),
    db()
      .select({
        approvals: sql<number>`count(*) filter (where ${verificationLogs.decision} = 'APPROVED')::int`,
        rejections: sql<number>`count(*) filter (where ${verificationLogs.decision} = 'REJECTED')::int`,
      })
      .from(verificationLogs),
    db()
      .select({
        verified: sql<number>`count(*)::int`,
        firstPass: sql<number>`count(*) filter (where ${verificationLogs.attemptNo} = 1)::int`,
      })
      .from(verificationLogs)
      .where(eq(verificationLogs.decision, "APPROVED")),
    db().select({ n: count() }).from(sewingOperations),
    db()
      .select({
        recipeCode: recipes.recipeCode,
        recipeName: recipes.name,
        wastageCapPct: recipes.wastageCap,
        approvedBatches: sql<number>`count(${verificationLogs.id})::int`,
        avgWastagePct: sql<string | null>`round(avg(${verificationLogs.wastagePct}), 2)`,
        maxWastagePct: sql<string | null>`max(${verificationLogs.wastagePct})`,
        overCapBatches: sql<number>`count(*) filter (where ${verificationLogs.wastagePct} > ${verificationLogs.wastageCapPct})::int`,
      })
      .from(recipes)
      .leftJoin(cuttingOrders, eq(cuttingOrders.recipeId, recipes.id))
      .leftJoin(verificationLogs, sql`${verificationLogs.orderId} = ${cuttingOrders.id} AND ${verificationLogs.decision} = 'APPROVED'`)
      .groupBy(recipes.id)
      .orderBy(asc(recipes.recipeCode)),
  ]);

  const ordersByStatus: Record<OrderStatus, number> = { PENDING_VERIFICATION: 0, VERIFIED: 0, REJECTED: 0 };
  for (const r of statusRows) ordersByStatus[r.status] = r.n;

  return {
    ordersByStatus,
    approvals: decisions.approvals,
    rejections: decisions.rejections,
    firstPassRatePct: firstPass.verified === 0 ? null : Math.round((firstPass.firstPass / firstPass.verified) * 1000) / 10,
    sewingStarted: sewing.n,
    wastageByRecipe: wastage.map((w) => ({
      ...w,
      avgWastagePct: w.avgWastagePct === null ? null : Number(w.avgWastagePct),
      maxWastagePct: w.maxWastagePct === null ? null : Number(w.maxWastagePct),
    })),
  };
}
