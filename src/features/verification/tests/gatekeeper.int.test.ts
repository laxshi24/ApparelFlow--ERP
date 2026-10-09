/**
 * Approval gatekeeper — the core business invariant:
 * a batch becomes VERIFIED only through an authenticated Cutting Verifier's approval
 * with every component counted and no shortage.
 */
import { randomUUID } from "node:crypto";
import { and, count, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/database/client";
import { auditEvents, cuttingOrders, users, verificationItems, verificationLogs } from "@/lib/database/schema";
import { resetTransactionalData } from "@/test/db";
import { createOrder } from "@/test/fixtures";
import { call, demoUser, loginAs } from "@/test/http";
import { approve, buildCounts, getItems, reject, saveCounts } from "@/test/verification-helpers";
import { saveCountsHandler } from "../server/verification.handlers";

let supervisor: string;
let verifier: string;
let sewing: string;
let verifierId: string;
let supervisorId: string;

beforeEach(async () => {
  await resetTransactionalData();
  [supervisor, verifier, sewing] = await Promise.all([
    loginAs("cutting_supervisor"),
    loginAs("cutting_verifier"),
    loginAs("sewing_supervisor"),
  ]);
  const all = await db().select({ id: users.id, email: users.email }).from(users);
  verifierId = all.find((u) => u.email === demoUser("cutting_verifier").email)!.id;
  supervisorId = all.find((u) => u.email === demoUser("cutting_supervisor").email)!.id;
});

const orderRow = async (id: string) => (await db().select().from(cuttingOrders).where(eq(cuttingOrders.id, id)))[0];
const logCount = async (id: string) =>
  (await db().select({ n: count() }).from(verificationLogs).where(eq(verificationLogs.orderId, id)))[0].n;

describe("1. successful approval", () => {
  it("an authenticated Verifier approves a fully counted batch with no shortage", async () => {
    const order = await createOrder(supervisor, { targetQty: 50, actualFabricYds: 95 });
    const counts = await buildCounts(verifier, order.id, (i) => i.expectedQty);
    expect((await saveCounts(verifier, order.id, counts)).status).toBe(200);

    const { status, body } = await approve(verifier, order.id);
    expect(status).toBe(200);
    expect(body.result).toMatchObject({ status: "VERIFIED", attemptNo: 1, verifierId, wastagePct: 5.56 });

    expect((await orderRow(order.id)).status).toBe("VERIFIED");
    const [log] = await db().select().from(verificationLogs).where(eq(verificationLogs.orderId, order.id));
    expect(log).toMatchObject({
      decision: "APPROVED",
      verifierId,
      rejectionNote: null,
      expectedFabricYds: 90,
      actualFabricYds: 95,
      wastagePct: 5.56,
      wastageCapPct: 5,
      fabricRollId: "ROLL-A-001",
    });
    expect(log.componentVariances).toHaveLength(5);
    expect(log.componentVariances.every((c) => c.status === "GREEN" && c.variance === 0)).toBe(true);

    const events = await db().select().from(auditEvents).where(eq(auditEvents.orderId, order.id));
    expect(events.map((e) => e.eventType).sort()).toEqual(["COUNTS_RECORDED", "ORDER_APPROVED", "ORDER_CREATED"]);
  });

  it("allows YELLOW surplus components (only shortages block)", async () => {
    const order = await createOrder(supervisor);
    const counts = await buildCounts(verifier, order.id, (i, idx) => (idx === 0 ? i.expectedQty + 3 : i.expectedQty));
    const { status } = await approve(verifier, order.id, { counts });
    expect(status).toBe(200);
    const [log] = await db().select().from(verificationLogs).where(eq(verificationLogs.orderId, order.id));
    expect(log.componentVariances[0]).toMatchObject({ status: "YELLOW", variance: 3 });
  });

  it("does not block approval when fabric wastage exceeds the recipe cap (recorded only)", async () => {
    const order = await createOrder(supervisor, { actualFabricYds: 120 });
    const counts = await buildCounts(verifier, order.id, (i) => i.expectedQty);
    const { status, body } = await approve(verifier, order.id, { counts });
    expect(status).toBe(200);
    expect(body.result.wastagePct).toBe(33.33);
  });
});

describe("2/3. shortage and incomplete counts block approval (422)", () => {
  it("rejects approval when at least one component is RED", async () => {
    const order = await createOrder(supervisor);
    const counts = await buildCounts(verifier, order.id, (i, idx) => (idx === 2 ? i.expectedQty - 1 : i.expectedQty));
    await saveCounts(verifier, order.id, counts);

    const { status, body } = await approve(verifier, order.id);
    expect(status).toBe(422);
    expect(body.error.details.reason).toBe("SHORTAGE");
    expect(body.error.details.shortages[0]).toMatchObject({ componentName: "Sleeves (left and right)", shortBy: 1 });
    expect((await orderRow(order.id)).status).toBe("PENDING_VERIFICATION");
    expect(await logCount(order.id)).toBe(0);
  });

  it("treats a zero count as a shortage, not as missing", async () => {
    const order = await createOrder(supervisor);
    const counts = await buildCounts(verifier, order.id, (i, idx) => (idx === 0 ? 0 : i.expectedQty));
    const { status, body } = await approve(verifier, order.id, { counts });
    expect(status).toBe(422);
    expect(body.error.details.reason).toBe("SHORTAGE");
  });

  it("rejects approval when any component is uncounted", async () => {
    const order = await createOrder(supervisor);
    const counts = await buildCounts(verifier, order.id, (i, idx) => (idx === 4 ? null : i.expectedQty));
    await saveCounts(verifier, order.id, counts);

    const { status, body } = await approve(verifier, order.id);
    expect(status).toBe(422);
    expect(body.error.details).toMatchObject({ reason: "INCOMPLETE_COUNTS", missing: ["Sleeve Cuffs"] });
    expect((await orderRow(order.id)).status).toBe("PENDING_VERIFICATION");
  });

  it("rejects approval when nothing has been counted at all", async () => {
    const order = await createOrder(supervisor);
    const { status, body } = await approve(verifier, order.id);
    expect(status).toBe(422);
    expect(body.error.details.missing).toHaveLength(5);
  });

  it("rejects approval when a recipe component has no verification record", async () => {
    const order = await createOrder(supervisor);
    const counts = await buildCounts(verifier, order.id, (i) => i.expectedQty);
    await saveCounts(verifier, order.id, counts);
    // Simulate a corrupted/partial item set (the guard trigger blocks DELETE, so bypass it for this fixture only).
    await db().transaction(async (tx) => {
      await tx.execute(sql`ALTER TABLE verification_items DISABLE TRIGGER verification_items_guard`);
      await tx.execute(sql`DELETE FROM verification_items WHERE id = ${counts[0].itemId}`);
      await tx.execute(sql`ALTER TABLE verification_items ENABLE TRIGGER verification_items_guard`);
    });
    const { status, body } = await approve(verifier, order.id);
    expect(status).toBe(422);
    expect(body.error.details.reason).toBe("MISSING_COMPONENT_RECORDS");
  });
});

describe("4. rejection requires a reason", () => {
  it.each([
    ["no reason", {}],
    ["empty reason", { reason: "" }],
    ["whitespace reason", { reason: "     " }],
    ["too short", { reason: "bad" }],
    ["non-string", { reason: 12345 }],
  ])("rejects %s with 400 and leaves the order pending", async (_label, body) => {
    const order = await createOrder(supervisor);
    const res = await reject(verifier, order.id, body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect((await orderRow(order.id)).status).toBe("PENDING_VERIFICATION");
    expect(await logCount(order.id)).toBe(0);
  });

  it("records a rejection with its reason", async () => {
    const order = await createOrder(supervisor);
    const res = await reject(verifier, order.id, { reason: "  Sleeve cuffs torn during cutting  " });
    expect(res.status).toBe(200);
    expect((await orderRow(order.id)).status).toBe("REJECTED");
    const [log] = await db().select().from(verificationLogs).where(eq(verificationLogs.orderId, order.id));
    expect(log).toMatchObject({ decision: "REJECTED", verifierId, rejectionNote: "Sleeve cuffs torn during cutting" });
  });
});

describe("5/6. only verifiers can decide (403)", () => {
  it.each([
    ["cutting_supervisor", () => supervisor],
    ["sewing_supervisor", () => sewing],
  ])("%s cannot approve, reject or record counts", async (_role, cookie) => {
    const order = await createOrder(supervisor);
    const counts = await buildCounts(verifier, order.id, (i) => i.expectedQty);

    const a = await approve(cookie(), order.id, { counts });
    expect(a.status).toBe(403);
    expect(a.body.error.code).toBe("FORBIDDEN");

    const r = await reject(cookie(), order.id, { reason: "Trying to reject without permission" });
    expect(r.status).toBe(403);

    expect((await saveCounts(cookie(), order.id, counts)).status).toBe(403);

    expect((await orderRow(order.id)).status).toBe("PENDING_VERIFICATION");
    expect(await logCount(order.id)).toBe(0);
    const items = await getItems(verifier, order.id);
    expect(items.every((i) => i.actualQty === null)).toBe(true);
  });

  it("returns 401 for anonymous approval and rejection", async () => {
    const order = await createOrder(supervisor);
    expect((await approve(undefined, order.id)).status).toBe(401);
    expect((await reject(undefined, order.id, { reason: "anonymous attempt" })).status).toBe(401);
  });

  it("returns 404 for unknown or malformed order ids", async () => {
    expect((await approve(verifier, randomUUID())).status).toBe(404);
    expect((await approve(verifier, "not-a-uuid")).status).toBe(404);
  });
});

describe("8. client-supplied identity, timestamps and status are ignored", () => {
  it("uses the session's verifier and the server clock", async () => {
    const order = await createOrder(supervisor);
    const counts = await buildCounts(verifier, order.id, (i) => i.expectedQty);
    const before = Date.now();
    const { status } = await approve(verifier, order.id, {
      counts,
      verifierId: supervisorId,
      verifier_id: supervisorId,
      timestamp: "2000-01-01T00:00:00Z",
      decision: "REJECTED",
      status: "REJECTED",
      wastagePct: 0,
      componentVariances: [],
    });
    expect(status).toBe(200);
    const [log] = await db().select().from(verificationLogs).where(eq(verificationLogs.orderId, order.id));
    expect(log.verifierId).toBe(verifierId);
    expect(log.decision).toBe("APPROVED");
    expect(log.wastagePct).toBe(5.56);
    expect(log.componentVariances).toHaveLength(5);
    expect(log.timestamp.getTime()).toBeGreaterThan(before - 60_000);
    expect(log.timestamp.getFullYear()).not.toBe(2000);
  });

  it("ignores client-supplied traffic-light status on counts", async () => {
    const order = await createOrder(supervisor);
    const items = await getItems(verifier, order.id);
    const res = await call(saveCountsHandler, "PUT", `/api/verification/${order.id}/counts`, {
      cookie: verifier,
      params: { orderId: order.id },
      body: { counts: [{ itemId: items[0].id, actualQty: 1, status: "GREEN", expectedQty: 1 }] },
    });
    expect(res.status).toBe(200);
    expect(res.body.items[0]).toMatchObject({ actualQty: 1, status: "RED", expectedQty: 50 });
  });
});

describe("9. duplicate and concurrent decisions", () => {
  it("parallel approvals produce exactly one approval record", async () => {
    const order = await createOrder(supervisor);
    const counts = await buildCounts(verifier, order.id, (i) => i.expectedQty);
    await saveCounts(verifier, order.id, counts);

    const results = await Promise.all(Array.from({ length: 6 }, () => approve(verifier, order.id)));
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s !== 200).every((s) => s === 422)).toBe(true);
    expect(await logCount(order.id)).toBe(1);
    const approvals = await db()
      .select({ n: count() })
      .from(auditEvents)
      .where(and(eq(auditEvents.orderId, order.id), eq(auditEvents.eventType, "ORDER_APPROVED")));
    expect(approvals[0].n).toBe(1);
  });

  it("a racing approve and reject cannot both succeed", async () => {
    const order = await createOrder(supervisor);
    const counts = await buildCounts(verifier, order.id, (i) => i.expectedQty);
    await saveCounts(verifier, order.id, counts);
    const [a, r] = await Promise.all([approve(verifier, order.id), reject(verifier, order.id, { reason: "Racing rejection" })]);
    expect([a.status, r.status].sort()).toEqual([200, 422]);
    expect(await logCount(order.id)).toBe(1);
  });

  it("a repeated approval after success returns 422 and creates nothing", async () => {
    const order = await createOrder(supervisor);
    const counts = await buildCounts(verifier, order.id, (i) => i.expectedQty);
    expect((await approve(verifier, order.id, { counts })).status).toBe(200);
    const again = await approve(verifier, order.id, { counts });
    expect(again.status).toBe(422);
    expect(again.body.error.details.reason).toBe("INVALID_STATE");
    expect(await logCount(order.id)).toBe(1);
  });
});

describe("10. invalid numeric inputs are rejected", () => {
  it.each([
    ["negative", -1],
    ["decimal", 2.5],
    ["numeric string", "50"],
    ["boolean", true],
    ["huge", 1e12],
    ["object", { n: 5 }],
  ])("rejects a %s count with 400", async (_label, value) => {
    const order = await createOrder(supervisor);
    const items = await getItems(verifier, order.id);
    const res = await saveCounts(verifier, order.id, [{ itemId: items[0].id, actualQty: value }]);
    expect(res.status).toBe(400);
    const approval = await approve(verifier, order.id, { counts: [{ itemId: items[0].id, actualQty: value }] });
    expect(approval.status).toBe(400);
  });

  it("rejects malformed bodies, duplicate items and items from another order", async () => {
    const order = await createOrder(supervisor);
    const other = await createOrder(supervisor);
    const items = await getItems(verifier, order.id);
    const otherItems = await getItems(verifier, other.id);
    expect((await saveCounts(verifier, order.id, [])).status).toBe(400);
    expect((await saveCounts(verifier, order.id, "lots")).status).toBe(400);
    expect(
      (await saveCounts(verifier, order.id, [
        { itemId: items[0].id, actualQty: 1 },
        { itemId: items[0].id, actualQty: 2 },
      ])).status,
    ).toBe(400);
    expect((await saveCounts(verifier, order.id, [{ itemId: otherItems[0].id, actualQty: 50 }])).status).toBe(400);
    expect((await getItems(verifier, other.id))[0].actualQty).toBeNull();
  });

  it("counts persist and can be cleared back to uncounted (never treated as zero)", async () => {
    const order = await createOrder(supervisor);
    const items = await getItems(verifier, order.id);
    await saveCounts(verifier, order.id, [{ itemId: items[0].id, actualQty: 50 }]);
    expect((await getItems(verifier, order.id))[0]).toMatchObject({ actualQty: 50, status: "GREEN" });
    await saveCounts(verifier, order.id, [{ itemId: items[0].id, actualQty: null }]);
    expect((await getItems(verifier, order.id))[0]).toMatchObject({ actualQty: null, status: null });
  });
});

describe("15. failed approvals leave no partial state", () => {
  it("counts sent with a failing approval are rolled back", async () => {
    const order = await createOrder(supervisor);
    const counts = await buildCounts(verifier, order.id, (i, idx) => (idx === 1 ? i.expectedQty - 10 : i.expectedQty));
    const res = await approve(verifier, order.id, { counts });
    expect(res.status).toBe(422);
    const items = await getItems(verifier, order.id);
    expect(items.every((i) => i.actualQty === null && i.status === null)).toBe(true);
    expect((await orderRow(order.id)).status).toBe("PENDING_VERIFICATION");
    expect(await logCount(order.id)).toBe(0);
    const events = await db().select().from(auditEvents).where(eq(auditEvents.orderId, order.id));
    expect(events.map((e) => e.eventType)).toEqual(["ORDER_CREATED"]);
  });

  it("counts on a decided order are refused", async () => {
    const order = await createOrder(supervisor);
    const counts = await buildCounts(verifier, order.id, (i) => i.expectedQty);
    await approve(verifier, order.id, { counts });
    const res = await saveCounts(verifier, order.id, [{ itemId: counts[0].itemId, actualQty: 1 }]);
    expect(res.status).toBe(422);
  });
});

describe("database-level defence in depth", () => {
  it("a direct UPDATE to VERIFIED without an approval log is refused by PostgreSQL", async () => {
    const order = await createOrder(supervisor);
    await expect(db().update(cuttingOrders).set({ status: "VERIFIED" }).where(eq(cuttingOrders.id, order.id))).rejects.toThrow();
    expect((await orderRow(order.id)).status).toBe("PENDING_VERIFICATION");
  });

  it("an APPROVED log cannot be forged for an order with a shortage", async () => {
    const order = await createOrder(supervisor);
    const counts = await buildCounts(verifier, order.id, (i) => i.expectedQty - 1);
    await saveCounts(verifier, order.id, counts);
    await expect(
      db().transaction(async (tx) => {
        await tx.insert(verificationLogs).values({
          orderId: order.id,
          attemptNo: 1,
          verifierId,
          decision: "APPROVED",
          expectedFabricYds: 90,
          actualFabricYds: 95,
          wastagePct: 5.56,
          wastageCapPct: 5,
          fabricRollId: "X",
          componentVariances: [],
        });
        await tx.update(cuttingOrders).set({ status: "VERIFIED" }).where(eq(cuttingOrders.id, order.id));
      }),
    ).rejects.toThrow();
    expect((await orderRow(order.id)).status).toBe("PENDING_VERIFICATION");
    expect(await logCount(order.id)).toBe(0);
  });

  it("verification logs and audit events are append-only", async () => {
    const order = await createOrder(supervisor);
    await reject(verifier, order.id, { reason: "Initial rejection for immutability test" });
    await expect(db().update(verificationLogs).set({ rejectionNote: "rewritten history" })).rejects.toThrow();
    await expect(db().delete(verificationLogs)).rejects.toThrow();
    await expect(db().update(auditEvents).set({ payload: {} })).rejects.toThrow();
    await expect(db().delete(auditEvents)).rejects.toThrow();
  });

  it("counts of a decided attempt cannot be modified directly", async () => {
    const order = await createOrder(supervisor);
    const counts = await buildCounts(verifier, order.id, (i) => i.expectedQty);
    await approve(verifier, order.id, { counts });
    await expect(
      db().update(verificationItems).set({ actualQty: 1, status: "RED" }).where(eq(verificationItems.orderId, order.id)),
    ).rejects.toThrow();
  });
});
