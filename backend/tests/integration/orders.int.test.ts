import { randomUUID } from "node:crypto";
import { count, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createOrderHandler, getOrderHandler, listOrdersHandler } from "@backend/controllers/orders.controller";
import { closeDb, db } from "@backend/db/client";
import { auditEvents, cuttingOrders, verificationItems } from "@backend/db/schema";
import { resetTransactionalData } from "@backend/tests/helpers/db";
import { createOrder, recipeIdByCode } from "@backend/tests/helpers/fixtures";
import { call, loginAs } from "@backend/tests/helpers/http";

let supervisor: string;
let verifier: string;
let sewing: string;
let blouseId: string;

beforeEach(async () => {
  await resetTransactionalData();
  [supervisor, verifier, sewing] = await Promise.all([
    loginAs("cutting_supervisor"),
    loginAs("cutting_verifier"),
    loginAs("sewing_supervisor"),
  ]);
});

beforeAll(async () => {
  blouseId = await recipeIdByCode("REC-BL01");
});

const validBody = () => ({
  recipeId: blouseId,
  targetQty: 50,
  fabricRollId: "ROLL-A-001",
  actualFabricYds: 95,
  idempotencyKey: randomUUID(),
});

const post = (cookie: string | undefined, body: unknown) => call(createOrderHandler, "POST", "/api/orders", { cookie, body });

describe("POST /api/orders — authorisation", () => {
  it("allows a Cutting Supervisor to create an order", async () => {
    const { status, body } = await post(supervisor, validBody());
    expect(status).toBe(201);
    expect(body.order.status).toBe("PENDING_VERIFICATION");
    expect(body.order.orderNo).toMatch(/^CO-\d{4}-\d{6}$/);
  });

  it.each([
    ["cutting_verifier", () => verifier],
    ["sewing_supervisor", () => sewing],
  ])("returns 403 for %s", async (_role, cookie) => {
    const { status, body } = await post(cookie(), validBody());
    expect(status).toBe(403);
    expect(body.error.code).toBe("FORBIDDEN");
    const [{ n }] = await db().select({ n: count() }).from(cuttingOrders);
    expect(n).toBe(0);
  });

  it("returns 401 without a session", async () => {
    expect((await post(undefined, validBody())).status).toBe(401);
  });
});

describe("POST /api/orders — persistence and derived data", () => {
  it("persists the order and derives expected counts from the recipe, ignoring client-supplied protected fields", async () => {
    const { body } = await post(supervisor, {
      ...validBody(),
      status: "VERIFIED",
      orderNo: "HACKED-1",
      createdBy: randomUUID(),
      currentAttempt: 7,
      items: [{ componentName: "Front Body Panel", expectedQty: 1 }],
      expectedQty: 1,
    });

    const [order] = await db().select().from(cuttingOrders).where(eq(cuttingOrders.id, body.order.id));
    expect(order.status).toBe("PENDING_VERIFICATION");
    expect(order.orderNo).not.toBe("HACKED-1");
    expect(order.currentAttempt).toBe(1);
    expect(order.actualFabricYds).toBe(95);

    const items = await db().select().from(verificationItems).where(eq(verificationItems.orderId, order.id));
    expect(items.map((i) => i.expectedQty).sort((a, b) => a - b)).toEqual([50, 50, 50, 100, 100]);
    expect(items.every((i) => i.actualQty === null && i.status === null && i.attemptNo === 1)).toBe(true);

    const audit = await db().select().from(auditEvents).where(eq(auditEvents.orderId, order.id));
    expect(audit).toHaveLength(1);
    expect(audit[0].eventType).toBe("ORDER_CREATED");
  });

  it("survives a fresh database connection (persistence across reloads)", async () => {
    const created = await createOrder(supervisor);
    await closeDb(); // drop the pool, as a redeploy/cold start would
    const { status, body } = await call(getOrderHandler, "GET", `/api/orders/${created.id}`, {
      cookie: supervisor,
      params: { id: created.id },
    });
    expect(status).toBe(200);
    expect(body.order.orderNo).toBe(created.orderNo);
    expect(body.order.items).toHaveLength(5);
  });

  it("is idempotent for duplicate submissions with the same key", async () => {
    const body = validBody();
    const [a, b] = await Promise.all([post(supervisor, body), post(supervisor, body)]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(a.body.order.id).toBe(b.body.order.id);
    const [{ n }] = await db().select({ n: count() }).from(cuttingOrders);
    expect(n).toBe(1);
    const [{ items }] = await db().select({ items: count() }).from(verificationItems);
    expect(items).toBe(5);
  });

  it("rejects reuse of a submission key for a different payload with 409", async () => {
    const body = validBody();
    await post(supervisor, body);
    const { status } = await post(supervisor, { ...body, targetQty: 60 });
    expect(status).toBe(409);
  });
});

describe("POST /api/orders — validation", () => {
  it.each([
    ["zero quantity", { targetQty: 0 }],
    ["negative quantity", { targetQty: -10 }],
    ["decimal quantity", { targetQty: 2.5 }],
    ["string quantity", { targetQty: "50" }],
    ["huge quantity", { targetQty: 100_001 }],
    ["negative fabric", { actualFabricYds: -1 }],
    ["fabric with 3 decimals", { actualFabricYds: 1.234 }],
    ["string fabric", { actualFabricYds: "95" }],
    ["NaN-like fabric", { actualFabricYds: null }],
    ["empty roll id", { fabricRollId: "   " }],
    ["roll id with markup", { fabricRollId: "<script>" }],
    ["missing recipe", { recipeId: undefined }],
    ["malformed recipe id", { recipeId: "abc" }],
    ["missing idempotency key", { idempotencyKey: undefined }],
  ])("rejects %s with 400", async (_label, patch) => {
    const { status, body } = await post(supervisor, { ...validBody(), ...patch });
    expect(status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an unknown recipe", async () => {
    const { status, body } = await post(supervisor, { ...validBody(), recipeId: randomUUID() });
    expect(status).toBe(400);
    expect(body.error.details.issues[0].path).toBe("recipeId");
  });

  it("accepts zero fabric (non-negative rule) and 2-decimal values", async () => {
    expect((await post(supervisor, { ...validBody(), actualFabricYds: 0 })).status).toBe(201);
    expect((await post(supervisor, { ...validBody(), actualFabricYds: 95.15 })).status).toBe(201);
  });
});

describe("GET /api/orders", () => {
  it("lists, searches, filters and paginates", async () => {
    const a = await createOrder(supervisor, { fabricRollId: "ROLL-SEARCH-77" });
    await createOrder(supervisor, { recipeCode: "REC-CT02", targetQty: 10, actualFabricYds: 11 });

    const all = await call(listOrdersHandler, "GET", "/api/orders", { cookie: verifier });
    expect(all.status).toBe(200);
    expect(all.body.total).toBe(2);

    const search = await call(listOrdersHandler, "GET", "/api/orders?q=search-77", { cookie: supervisor });
    expect(search.body.orders.map((o: { id: string }) => o.id)).toEqual([a.id]);

    const crop = await call(listOrdersHandler, "GET", "/api/orders?q=crop", { cookie: supervisor });
    expect(crop.body.total).toBe(1);

    const wildcard = await call(listOrdersHandler, "GET", "/api/orders?q=%25", { cookie: supervisor });
    expect(wildcard.body.total).toBe(0);

    const verified = await call(listOrdersHandler, "GET", "/api/orders?status=VERIFIED", { cookie: supervisor });
    expect(verified.body.total).toBe(0);

    const page2 = await call(listOrdersHandler, "GET", "/api/orders?page=2", { cookie: supervisor });
    expect(page2.body.orders).toHaveLength(0);
  });

  it("is not available to the Sewing Supervisor (sewing queue only)", async () => {
    expect((await call(listOrdersHandler, "GET", "/api/orders", { cookie: sewing })).status).toBe(403);
    const order = await createOrder(supervisor);
    expect((await call(getOrderHandler, "GET", `/api/orders/${order.id}`, { cookie: sewing, params: { id: order.id } })).status).toBe(403);
  });
});
