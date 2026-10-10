import "server-only";
import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@backend/middleware/auth";
import { can } from "@shared/permissions";
import { db } from "@backend/db/client";
import { cuttingOrders } from "@backend/db/schema";
import { ForbiddenError, NotFoundError } from "@shared/errors";
import { apiHandler } from "@backend/middleware/api-handler";
import { parseId, parseOrThrow } from "@shared/validation/helpers";
import { getAuditSummary, getOrderTimeline, listDecisions } from "@backend/services/audit/audit.service";

const pageSchema = z.object({ page: z.coerce.number().int().min(1).max(10_000).default(1).catch(1) });

/** GET /api/audit/summary — read-only reporting. Audit data has no write endpoints at all. */
export const auditSummaryHandler = apiHandler(async (request: NextRequest) => {
  await requireApiUser(request, "audit:read");
  return NextResponse.json({ summary: await getAuditSummary() });
});

/** GET /api/audit/decisions?page=N */
export const auditDecisionsHandler = apiHandler(async (request: NextRequest) => {
  await requireApiUser(request, "audit:read");
  const { page } = parseOrThrow(pageSchema, Object.fromEntries(request.nextUrl.searchParams));
  return NextResponse.json(await listDecisions(page));
});

/**
 * GET /api/orders/:id/timeline
 * Cutting roles may read any order's timeline; the Sewing Supervisor only that of VERIFIED batches.
 */
export const orderTimelineHandler = apiHandler(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireApiUser(request);
  const id = parseId((await params).id, "Cutting order");
  await assertTimelineAccess(user.role, id);
  return NextResponse.json({ events: await getOrderTimeline(id) });
});

export async function assertTimelineAccess(role: Parameters<typeof can>[0], orderId: string): Promise<void> {
  if (can(role, "orders:read")) {
    const [exists] = await db().select({ id: cuttingOrders.id }).from(cuttingOrders).where(eq(cuttingOrders.id, orderId));
    if (!exists) throw new NotFoundError("Cutting order not found");
    return;
  }
  if (can(role, "sewing:read")) {
    const [verified] = await db()
      .select({ id: cuttingOrders.id })
      .from(cuttingOrders)
      .where(and(eq(cuttingOrders.id, orderId), eq(cuttingOrders.status, "VERIFIED")));
    if (!verified) throw new NotFoundError("Verified batch not found");
    return;
  }
  throw new ForbiddenError();
}
