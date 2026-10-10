import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser } from "@backend/middleware/auth";
import { apiHandler } from "@backend/middleware/api-handler";
import { parseId } from "@shared/validation/helpers";
import { getSewingOrder, listSewingQueue } from "@backend/services/sewing/sewing-queries.service";
import { startAssembly } from "@backend/services/sewing/start-assembly.service";

type OrderContext = { params: Promise<{ orderId: string }> };

/** GET /api/sewing — verified batches only. Query parameters are intentionally ignored. */
export const sewingQueueHandler = apiHandler(async (request: NextRequest) => {
  await requireApiUser(request, "sewing:read");
  return NextResponse.json({ orders: await listSewingQueue() });
});

/** GET /api/sewing/:orderId — 404 unless the batch is VERIFIED. */
export const sewingOrderHandler = apiHandler(async (request: NextRequest, { params }: OrderContext) => {
  await requireApiUser(request, "sewing:read");
  const id = parseId((await params).orderId, "Verified batch");
  return NextResponse.json({ order: await getSewingOrder(id) });
});

/** POST /api/sewing/:orderId/start — 201 when started, 200 when it was already running. */
export const startAssemblyHandler = apiHandler(async (request: NextRequest, { params }: OrderContext) => {
  const user = await requireApiUser(request, "sewing:start");
  const id = parseId((await params).orderId, "Verified batch");
  const result = await startAssembly(user, id);
  return NextResponse.json({ operation: result }, { status: result.alreadyStarted ? 200 : 201 });
});
