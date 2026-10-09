import { and, asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getOrderHandler, recutOrderHandler } from "@/features/cutting-orders/server/order.handlers";
import { db } from "@/lib/database/client";
import { auditEvents, cuttingOrders, verificationItems, verificationLogs } from "@/lib/database/schema";
import { resetTransactionalData } from "@/test/db";
import { createOrder } from "@/test/fixtures";
import { call, loginAs } from "@/test/http";
import { approve, buildCounts, getItems, reject } from "@/test/verification-helpers";

let supervisor: string;
let verifier: string;
let sewing: string;

beforeEach(async () => {
  await resetTransactionalData();
  [supervisor, verifier, sewing] = await Promise.all([
    loginAs("cutting_supervisor"),
    loginAs("cutting_verifier"),
    loginAs("sewing_supervisor"),
  ]);
});

const recut = (cookie: string, id: string, body: unknown) =>
  call(recutOrderHandler, "POST", `/api/orders/${id}/recut`, { cookie, body, params: { id } });

const validRecut = { fabricRollId: "ROLL-B-002", actualFabricYds: 91.5, note: "Re-cut sleeve cuffs from a new roll" };

/** Creates an order, counts it with a shortage and rejects it. */
async function rejectedOrder() {
  const order = await createOrder(supervisor);
  const counts = await buildCounts(verifier, order.id, (i, idx) => (idx === 4 ? i.expectedQty - 8 : i.expectedQty));
  const res = await reject(verifier, order.id, { reason: "8 sleeve cuffs missing from the bundle", counts });
  expect(res.status).toBe(200);
  return order;
}

describe("rejected order review", () => {
  it("shows the supervisor the rejection reason, verifier and counted shortage", async () => {
    const order = await rejectedOrder();
    const { status, body } = await call(getOrderHandler, "GET", `/api/orders/${order.id}`, { cookie: supervisor, params: { id: order.id } });
    expect(status).toBe(200);
    expect(body.order.status).toBe("REJECTED");
    expect(body.order.decisions).toHaveLength(1);
    expect(body.order.decisions[0]).toMatchObject({
      decision: "REJECTED",
      rejectionNote: "8 sleeve cuffs missing from the bundle",
      verifierName: "Kavindi Silva",
    });
    expect(body.order.decisions[0].componentVariances[4]).toMatchObject({ componentName: "Sleeve Cuffs", variance: -8, status: "RED" });
  });
});

describe("POST /api/orders/:id/recut", () => {
  it.each([
    ["cutting_verifier", () => verifier],
    ["sewing_supervisor", () => sewing],
  ])("is forbidden for %s", async (_role, cookie) => {
    const order = await rejectedOrder();
    expect((await recut(cookie(), order.id, validRecut)).status).toBe(403);
  });

  it("validates input", async () => {
    const order = await rejectedOrder();
    expect((await recut(supervisor, order.id, { ...validRecut, note: "" })).status).toBe(400);
    expect((await recut(supervisor, order.id, { ...validRecut, actualFabricYds: -2 })).status).toBe(400);
    expect((await recut(supervisor, order.id, { ...validRecut, fabricRollId: "" })).status).toBe(400);
  });

  it("only applies to REJECTED orders", async () => {
    const pending = await createOrder(supervisor);
    expect((await recut(supervisor, pending.id, validRecut)).status).toBe(422);

    const verified = await createOrder(supervisor);
    await approve(verifier, verified.id, { counts: await buildCounts(verifier, verified.id, (i) => i.expectedQty) });
    const res = await recut(supervisor, verified.id, validRecut);
    expect(res.status).toBe(422);
    expect(res.body.error.details.reason).toBe("INVALID_STATE");
  });

  it("opens a new uncounted attempt and preserves the full history of the previous one", async () => {
    const order = await rejectedOrder();
    const res = await recut(supervisor, order.id, { ...validRecut, status: "VERIFIED", currentAttempt: 9 });
    expect(res.status).toBe(200);
    expect(res.body.order).toMatchObject({ status: "PENDING_VERIFICATION", currentAttempt: 2 });

    const [row] = await db().select().from(cuttingOrders).where(eq(cuttingOrders.id, order.id));
    expect(row).toMatchObject({ status: "PENDING_VERIFICATION", currentAttempt: 2, fabricRollId: "ROLL-B-002", actualFabricYds: 91.5 });

    const items = await db().select().from(verificationItems).where(eq(verificationItems.orderId, order.id)).orderBy(asc(verificationItems.attemptNo));
    const attempt1 = items.filter((i) => i.attemptNo === 1);
    const attempt2 = items.filter((i) => i.attemptNo === 2);
    expect(attempt1).toHaveLength(5);
    expect(attempt1.every((i) => i.actualQty !== null)).toBe(true);
    expect(attempt2).toHaveLength(5);
    expect(attempt2.every((i) => i.actualQty === null && i.status === null)).toBe(true);

    const [log] = await db().select().from(verificationLogs).where(eq(verificationLogs.orderId, order.id));
    expect(log).toMatchObject({ attemptNo: 1, decision: "REJECTED", fabricRollId: "ROLL-A-001", actualFabricYds: 95 });

    const [event] = await db()
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.orderId, order.id), eq(auditEvents.eventType, "RECUT_SUBMITTED")));
    expect(event.payload).toMatchObject({
      previousAttempt: 1,
      newAttempt: 2,
      previous: { fabricRollId: "ROLL-A-001", actualFabricYds: 95 },
      current: { fabricRollId: "ROLL-B-002", actualFabricYds: 91.5 },
    });
  });
});

describe("14. rejected batches cannot bypass re-verification", () => {
  it("cannot be approved while REJECTED", async () => {
    const order = await rejectedOrder();
    const counts = await buildCounts(verifier, order.id, (i) => i.expectedQty);
    const res = await approve(verifier, order.id, { counts });
    expect(res.status).toBe(422);
    expect(res.body.error.details.reason).toBe("INVALID_STATE");
  });

  it("after a re-cut, the new attempt must be fully counted again before approval", async () => {
    const order = await rejectedOrder();
    await recut(supervisor, order.id, validRecut);

    // Previous attempt's counts do not carry over.
    const blocked = await approve(verifier, order.id);
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.details.missing).toHaveLength(5);

    const items = await getItems(verifier, order.id);
    expect(items.every((i) => i.actualQty === null)).toBe(true);

    const ok = await approve(verifier, order.id, { counts: items.map((i) => ({ itemId: i.id, actualQty: i.expectedQty })) });
    expect(ok.status).toBe(200);
    expect(ok.body.result).toMatchObject({ status: "VERIFIED", attemptNo: 2, wastagePct: 1.67 });

    const { body } = await call(getOrderHandler, "GET", `/api/orders/${order.id}`, { cookie: supervisor, params: { id: order.id } });
    expect(body.order.decisions.map((d: { attemptNo: number; decision: string }) => [d.attemptNo, d.decision])).toEqual([
      [1, "REJECTED"],
      [2, "APPROVED"],
    ]);
  });

  it("can be rejected and re-cut repeatedly without losing earlier attempts", async () => {
    const order = await rejectedOrder();
    await recut(supervisor, order.id, validRecut);
    expect((await reject(verifier, order.id, { reason: "Second attempt still short" })).status).toBe(200);
    expect((await recut(supervisor, order.id, { ...validRecut, note: "Third cut from roll C" })).status).toBe(200);
    const logs = await db().select().from(verificationLogs).where(eq(verificationLogs.orderId, order.id));
    expect(logs.map((l) => l.attemptNo).sort()).toEqual([1, 2]);
    const [row] = await db().select().from(cuttingOrders).where(eq(cuttingOrders.id, order.id));
    expect(row.currentAttempt).toBe(3);
  });
});
