import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { recutOrderHandler } from "@backend/controllers/orders.controller";
import { startAssemblyHandler } from "@backend/controllers/sewing.controller";
import { calculateWastage } from "@shared/domain/wastage";
import { resetTransactionalData } from "@backend/tests/helpers/db";
import { createOrder } from "@backend/tests/helpers/fixtures";
import { call, loginAs } from "@backend/tests/helpers/http";
import { buildCounts, countExactAndApprove, reject, saveCounts } from "@backend/tests/helpers/verification-helpers";
import { auditDecisionsHandler, auditSummaryHandler, orderTimelineHandler } from "@backend/controllers/audit.controller";

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

const timeline = (cookie: string, id: string) => call(orderTimelineHandler, "GET", `/api/orders/${id}/timeline`, { cookie, params: { id } });

describe("order timeline", () => {
  it("reflects every server-side event in order, with attribution", async () => {
    const order = await createOrder(supervisor);
    await saveCounts(verifier, order.id, await buildCounts(verifier, order.id, (i, idx) => (idx === 0 ? i.expectedQty - 2 : i.expectedQty)));
    await reject(verifier, order.id, { reason: "Front panels short by 2" });
    await call(recutOrderHandler, "POST", `/api/orders/${order.id}/recut`, {
      cookie: supervisor,
      params: { id: order.id },
      body: { fabricRollId: "ROLL-R2", actualFabricYds: 93, note: "Cut 2 extra front panels" },
    });
    await countExactAndApprove(verifier, order.id);
    await call(startAssemblyHandler, "POST", `/api/sewing/${order.id}/start`, { cookie: sewing, params: { orderId: order.id } });

    const { status, body } = await timeline(supervisor, order.id);
    expect(status).toBe(200);
    expect(body.events.map((e: { eventType: string }) => e.eventType)).toEqual([
      "ORDER_CREATED",
      "COUNTS_RECORDED",
      "ORDER_REJECTED",
      "RECUT_SUBMITTED",
      "COUNTS_RECORDED",
      "ORDER_APPROVED",
      "SEWING_STARTED",
    ]);
    const actors = body.events.map((e: { actorName: string }) => e.actorName);
    expect(actors).toEqual(["Nimal Perera", "Kavindi Silva", "Kavindi Silva", "Nimal Perera", "Kavindi Silva", "Kavindi Silva", "Ruwan Fernando"]);
    expect(body.events[2].payload.reason).toBe("Front panels short by 2");
  });

  it("is visible to the Sewing Supervisor only for VERIFIED batches", async () => {
    const pending = await createOrder(supervisor);
    expect((await timeline(sewing, pending.id)).status).toBe(404);
    const verified = await createOrder(supervisor);
    await countExactAndApprove(verifier, verified.id);
    expect((await timeline(sewing, verified.id)).status).toBe(200);
  });

  it("requires authentication", async () => {
    const order = await createOrder(supervisor);
    expect((await call(orderTimelineHandler, "GET", `/api/orders/${order.id}/timeline`, { params: { id: order.id } })).status).toBe(401);
  });
});

describe("audit reporting", () => {
  it("summarises decisions and wastage consistently with the domain calculation", async () => {
    const a = await createOrder(supervisor, { actualFabricYds: 95 }); // 5.56% (over 5% cap)
    const b = await createOrder(supervisor, { actualFabricYds: 89 }); // -1.11%
    const c = await createOrder(supervisor, { recipeCode: "REC-CT02", targetQty: 50, actualFabricYds: 57 }); // 3.64%
    const d = await createOrder(supervisor);
    await countExactAndApprove(verifier, a.id);
    await countExactAndApprove(verifier, b.id);
    await countExactAndApprove(verifier, c.id);
    await reject(verifier, d.id, { reason: "Wrong fabric roll used" });

    const { status, body } = await call(auditSummaryHandler, "GET", "/api/audit/summary", { cookie: verifier });
    expect(status).toBe(200);
    const s = body.summary;
    expect(s.ordersByStatus).toEqual({ PENDING_VERIFICATION: 0, VERIFIED: 3, REJECTED: 1 });
    expect(s).toMatchObject({ approvals: 3, rejections: 1, firstPassRatePct: 100, sewingStarted: 0 });

    const blouse = s.wastageByRecipe.find((r: { recipeCode: string }) => r.recipeCode === "REC-BL01");
    // Average of the stored per-batch percentages, rounded half away from zero in exact integer hundredths.
    const stored = [95, 89].map((yds) => calculateWastage({ targetQty: 50, stdFabricYards: 1.8, actualFabricYds: yds, wastageCapPct: 5 }).wastagePct);
    expect(stored).toEqual([5.56, -1.11]);
    const sumHundredths = stored.reduce((sum, p) => sum + Math.round(p * 100), 0); // 445
    const expectedAvg = Math.round(sumHundredths / stored.length) / 100; // 222.5 → 223 → 2.23
    expect(blouse).toMatchObject({ approvedBatches: 2, avgWastagePct: expectedAvg, maxWastagePct: 5.56, overCapBatches: 1 });
    const crop = s.wastageByRecipe.find((r: { recipeCode: string }) => r.recipeCode === "REC-CT02");
    expect(crop).toMatchObject({ approvedBatches: 1, avgWastagePct: 3.64, overCapBatches: 0 });
  });

  it("lists decisions newest first with verifier and reason", async () => {
    const a = await createOrder(supervisor);
    const b = await createOrder(supervisor);
    await countExactAndApprove(verifier, a.id);
    await reject(verifier, b.id, { reason: "Cuffs misaligned" });
    const { body } = await call(auditDecisionsHandler, "GET", "/api/audit/decisions", { cookie: supervisor });
    expect(body.total).toBe(2);
    expect(body.rows[0]).toMatchObject({ orderId: b.id, decision: "REJECTED", rejectionNote: "Cuffs misaligned", verifierName: "Kavindi Silva" });
    expect(body.rows[1]).toMatchObject({ orderId: a.id, decision: "APPROVED", rejectionNote: null });
  });

  it("is not available to the Sewing Supervisor", async () => {
    expect((await call(auditSummaryHandler, "GET", "/api/audit/summary", { cookie: sewing })).status).toBe(403);
    expect((await call(auditDecisionsHandler, "GET", "/api/audit/decisions", { cookie: sewing })).status).toBe(403);
  });
});

describe("API surface", () => {
  function routeFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      return statSync(full).isDirectory() ? routeFiles(full) : name === "route.ts" ? [full] : [];
    });
  }

  it("exposes no write endpoints for audit data, and only the intended methods overall", () => {
    const root = path.resolve("frontend/app/api");
    const surface = Object.fromEntries(
      routeFiles(root).map((file) => {
        const route = "/api/" + path.relative(root, path.dirname(file)).split(path.sep).join("/");
        // Exported names after `as` (or bare), e.g. `export { login as POST }` / `export { GET }`.
        // e.g. `export const { GET, POST } = apiRoutes["/api/orders"];`
        const exported = /export\s+(?:const\s+)?\{([^}]*)\}/.exec(readFileSync(file, "utf8"))?.[1] ?? "";
        const methods = [...exported.matchAll(/\b(GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => m[1]).sort();
        return [route, methods.join(",")];
      }),
    );
    expect(surface).toEqual({
      "/api/audit/decisions": "GET",
      "/api/audit/summary": "GET",
      "/api/auth/login": "POST",
      "/api/auth/logout": "POST",
      "/api/auth/me": "GET",
      "/api/health": "GET",
      "/api/orders": "GET,POST",
      "/api/orders/[id]": "GET",
      "/api/orders/[id]/recut": "POST",
      "/api/orders/[id]/timeline": "GET",
      "/api/recipes": "GET",
      "/api/recipes/[id]": "GET",
      "/api/recipes/[id]/breakdown": "GET",
      "/api/sewing": "GET",
      "/api/sewing/[orderId]": "GET",
      "/api/sewing/[orderId]/start": "POST",
      "/api/verification": "GET",
      "/api/verification/[orderId]": "GET",
      "/api/verification/[orderId]/approve": "POST",
      "/api/verification/[orderId]/counts": "PUT",
      "/api/verification/[orderId]/reject": "POST",
    });
  });
});
