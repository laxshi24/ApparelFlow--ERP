import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { getOrderDetail } from "@backend/services/orders/order-queries.service";
import { requireApiUser } from "@backend/middleware/auth";
import { apiHandler } from "@backend/middleware/api-handler";
import { parseId, parseOrThrow, readJson } from "@shared/validation/helpers";
import { approveSchema, rejectSchema, saveCountsSchema } from "@shared/validation/verification.schema";
import { approveOrder, rejectOrder, saveCounts } from "@backend/services/verification/decision.service";
import { listPendingVerification } from "@backend/services/verification/verification-queries.service";

type OrderContext = { params: Promise<{ orderId: string }> };

/** GET /api/verification — pending queue (verifiers only). */
export const listPendingHandler = apiHandler(async (request: NextRequest) => {
  await requireApiUser(request, "verification:read");
  return NextResponse.json({ orders: await listPendingVerification() });
});

/** GET /api/verification/:orderId — order with its current-attempt items. */
export const getVerificationHandler = apiHandler(async (request: NextRequest, { params }: OrderContext) => {
  await requireApiUser(request, "verification:read");
  const id = parseId((await params).orderId, "Cutting order");
  return NextResponse.json({ order: await getOrderDetail(id) });
});

/** PUT /api/verification/:orderId/counts — record physical counts (traffic light computed server-side). */
export const saveCountsHandler = apiHandler(async (request: NextRequest, { params }: OrderContext) => {
  const user = await requireApiUser(request, "verification:count");
  const id = parseId((await params).orderId, "Cutting order");
  const { counts } = parseOrThrow(saveCountsSchema, await readJson(request));
  await saveCounts(user, id, counts);
  const order = await getOrderDetail(id);
  return NextResponse.json({ items: order.items });
});

/**
 * POST /api/verification/:orderId/approve
 * 403 for non-verifiers (checked before the body is even read); 422 for missing/short counts or wrong state.
 */
export const approveHandler = apiHandler(async (request: NextRequest, { params }: OrderContext) => {
  const user = await requireApiUser(request, "verification:decide");
  const id = parseId((await params).orderId, "Cutting order");
  const { counts } = parseOrThrow(approveSchema, await readJson(request));
  return NextResponse.json({ result: await approveOrder(user, id, counts) });
});

/** POST /api/verification/:orderId/reject — mandatory reason. */
export const rejectHandler = apiHandler(async (request: NextRequest, { params }: OrderContext) => {
  const user = await requireApiUser(request, "verification:decide");
  const id = parseId((await params).orderId, "Cutting order");
  const { reason, counts } = parseOrThrow(rejectSchema, await readJson(request));
  return NextResponse.json({ result: await rejectOrder(user, id, reason, counts) });
});
