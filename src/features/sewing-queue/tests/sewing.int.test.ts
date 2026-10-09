import { randomUUID } from "node:crypto";
import { and, count, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { recutOrderHandler } from "@/features/cutting-orders/server/order.handlers";
import { db } from "@/lib/database/client";
import { auditEvents, cuttingOrders, sewingOperations, verificationLogs } from "@/lib/database/schema";
import { resetTransactionalData } from "@/test/db";
import { createOrder } from "@/test/fixtures";
import { call, loginAs } from "@/test/http";
import { buildCounts, countExactAndApprove, reject, saveCounts } from "@/test/verification-helpers";
import { sewingOrderHandler, sewingQueueHandler, startAssemblyHandler } from "../server/sewing.handlers";

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

const queue = (cookie: string, path = "/api/sewing") => call(sewingQueueHandler, "GET", path, { cookie });
const detail = (cookie: string, orderId: string) => call(sewingOrderHandler, "GET", `/api/sewing/${orderId}`, { cookie, params: { orderId } });
const start = (cookie: string, orderId: string, body: unknown = {}) =>
  call(startAssemblyHandler, "POST", `/api/sewing/${orderId}/start`, { cookie, body, params: { orderId } });

/** One order in every state the queue must exclude, plus one verified order. */
async function mixedFloor() {
  const pending = await createOrder(supervisor, { fabricRollId: "PENDING" });
  const partlyCounted = await createOrder(supervisor, { fabricRollId: "PARTIAL" });
  await saveCounts(verifier, partlyCounted.id, await buildCounts(verifier, partlyCounted.id, (i) => i.expectedQty));
  const rejected = await createOrder(supervisor, { fabricRollId: "REJECTED" });
  await reject(verifier, rejected.id, { reason: "Shortage on cuffs" });
  const recut = await createOrder(supervisor, { fabricRollId: "RECUT" });
  await reject(verifier, recut.id, { reason: "Shortage on collars" });
  await call(recutOrderHandler, "POST", `/api/orders/${recut.id}/recut`, {
    cookie: supervisor,
    params: { id: recut.id },
    body: { fabricRollId: "RECUT-2", actualFabricYds: 96, note: "Collars re-cut" },
  });
  const verified = await createOrder(supervisor, { fabricRollId: "VERIFIED" });
  await countExactAndApprove(verifier, verified.id);
  return { pending, partlyCounted, rejected, recut, verified };
}

describe("7. the Sewing Queue never returns unapproved orders", () => {
  it("returns only VERIFIED batches with verifier attribution", async () => {
    const floor = await mixedFloor();
    const { status, body } = await queue(sewing);
    expect(status).toBe(200);
    expect(body.orders.map((o: { id: string }) => o.id)).toEqual([floor.verified.id]);
    expect(body.orders[0]).toMatchObject({ verifierName: "Kavindi Silva", wastagePct: 5.56, sewingStartedAt: null });
  });

  it("ignores query-string manipulation", async () => {
    const floor = await mixedFloor();
    for (const qs of ["?status=PENDING_VERIFICATION", "?status=REJECTED", "?all=true", "?includeUnverified=1"]) {
      const { body } = await queue(sewing, `/api/sewing${qs}`);
      expect(body.orders.map((o: { id: string }) => o.id)).toEqual([floor.verified.id]);
    }
  });

  it("returns 404 for the detail of any non-verified order (no existence leak)", async () => {
    const floor = await mixedFloor();
    for (const o of [floor.pending, floor.partlyCounted, floor.rejected, floor.recut]) {
      const res = await detail(sewing, o.id);
      expect(res.status).toBe(404);
    }
    const ok = await detail(sewing, floor.verified.id);
    expect(ok.status).toBe(200);
    expect(ok.body.order.items.every((i: { status: string }) => i.status === "GREEN")).toBe(true);
    expect(ok.body.order.decisions.at(-1)).toMatchObject({ decision: "APPROVED", verifierName: "Kavindi Silva" });
  });

  it("excludes a non-VERIFIED order even if a forged APPROVED log exists for it (status filter in SQL)", async () => {
    const order = await createOrder(supervisor);
    const [row] = await db().select().from(cuttingOrders).where(eq(cuttingOrders.id, order.id));
    await db().insert(verificationLogs).values({
      orderId: order.id,
      attemptNo: 1,
      verifierId: row.createdBy,
      decision: "APPROVED",
      expectedFabricYds: 90,
      actualFabricYds: 95,
      wastagePct: 5.56,
      wastageCapPct: 5,
      fabricRollId: row.fabricRollId,
      componentVariances: [],
    });
    expect((await queue(sewing)).body.orders).toEqual([]);
    expect((await detail(sewing, order.id)).status).toBe(404);
    expect((await start(sewing, order.id)).status).toBe(404);
  });

  it("is empty when nothing is verified", async () => {
    await createOrder(supervisor);
    expect((await queue(sewing)).body.orders).toEqual([]);
  });

  it.each([
    ["cutting_supervisor", () => supervisor],
    ["cutting_verifier", () => verifier],
  ])("is forbidden for %s", async (_role, cookie) => {
    const order = await createOrder(supervisor);
    await countExactAndApprove(verifier, order.id);
    expect((await queue(cookie())).status).toBe(403);
    expect((await detail(cookie(), order.id)).status).toBe(403);
  });
});

describe("12. starting sewing assembly", () => {
  it("persists the start for a verified batch without altering the verification record", async () => {
    const order = await createOrder(supervisor);
    await countExactAndApprove(verifier, order.id);

    const res = await start(sewing, order.id, { startedBy: randomUUID(), startedAt: "1999-01-01" });
    expect(res.status).toBe(201);
    expect(res.body.operation.alreadyStarted).toBe(false);

    const [op] = await db().select().from(sewingOperations).where(eq(sewingOperations.orderId, order.id));
    expect(op.status).toBe("IN_PROGRESS");
    expect(op.startedAt.getFullYear()).not.toBe(1999);

    const [row] = await db().select().from(cuttingOrders).where(eq(cuttingOrders.id, order.id));
    expect(row.status).toBe("VERIFIED");
    const [{ n }] = await db().select({ n: count() }).from(verificationLogs).where(eq(verificationLogs.orderId, order.id));
    expect(n).toBe(1);

    const q = await queue(sewing);
    expect(q.body.orders[0].sewingStartedAt).not.toBeNull();
    expect(q.body.orders[0].sewingStartedByName).toBe("Ruwan Fernando");
  });

  it("is idempotent for repeated and concurrent start requests", async () => {
    const order = await createOrder(supervisor);
    await countExactAndApprove(verifier, order.id);
    const results = await Promise.all(Array.from({ length: 5 }, () => start(sewing, order.id)));
    expect(results.map((r) => r.status).sort()).toEqual([200, 200, 200, 200, 201]);
    const [{ ops }] = await db().select({ ops: count() }).from(sewingOperations).where(eq(sewingOperations.orderId, order.id));
    expect(ops).toBe(1);
    const [{ events }] = await db()
      .select({ events: count() })
      .from(auditEvents)
      .where(and(eq(auditEvents.orderId, order.id), eq(auditEvents.eventType, "SEWING_STARTED")));
    expect(events).toBe(1);
  });

  it("cannot start assembly on unverified batches", async () => {
    const floor = await mixedFloor();
    for (const o of [floor.pending, floor.rejected, floor.recut]) {
      expect((await start(sewing, o.id)).status).toBe(404);
    }
    const [{ ops }] = await db().select({ ops: count() }).from(sewingOperations);
    expect(ops).toBe(0);
  });

  it("the database refuses a sewing operation for an unverified order even if inserted directly", async () => {
    const order = await createOrder(supervisor);
    const [row] = await db().select().from(cuttingOrders).where(eq(cuttingOrders.id, order.id));
    await expect(db().insert(sewingOperations).values({ orderId: order.id, startedBy: row.createdBy })).rejects.toThrow();
  });

  it.each([
    ["cutting_supervisor", () => supervisor],
    ["cutting_verifier", () => verifier],
  ])("is forbidden for %s", async (_role, cookie) => {
    const order = await createOrder(supervisor);
    await countExactAndApprove(verifier, order.id);
    const res = await start(cookie(), order.id);
    expect(res.status).toBe(403);
    const [{ ops }] = await db().select({ ops: count() }).from(sewingOperations);
    expect(ops).toBe(0);
  });
});
