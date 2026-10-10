import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser } from "@backend/middleware/auth";
import { apiHandler } from "@backend/middleware/api-handler";
import { parseId, parseOrThrow, readJson } from "@shared/validation/helpers";
import { createOrderSchema, listOrdersQuerySchema } from "@shared/validation/order.schema";
import { recutSchema } from "@shared/validation/recut.schema";
import { createCuttingOrder } from "@backend/services/orders/create-order.service";
import { recutOrder } from "@backend/services/orders/recut-order.service";
import { getOrderDetail, listOrders } from "@backend/services/orders/order-queries.service";

/** POST /api/orders — Cutting Supervisor only. 201 on create, 200 on idempotent replay. */
export const createOrderHandler = apiHandler(async (request: NextRequest) => {
  const user = await requireApiUser(request, "orders:create");
  const input = parseOrThrow(createOrderSchema, await readJson(request));
  const order = await createCuttingOrder(user, input);
  return NextResponse.json({ order }, { status: order.created ? 201 : 200 });
});

/** GET /api/orders?q=&status=&page= */
export const listOrdersHandler = apiHandler(async (request: NextRequest) => {
  await requireApiUser(request, "orders:read");
  const query = parseOrThrow(listOrdersQuerySchema, Object.fromEntries(request.nextUrl.searchParams));
  return NextResponse.json(await listOrders(query));
});

/** POST /api/orders/:id/recut — Cutting Supervisor re-submits a REJECTED batch for a new verification attempt. */
export const recutOrderHandler = apiHandler(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireApiUser(request, "orders:recut");
  const id = parseId((await params).id, "Cutting order");
  const input = parseOrThrow(recutSchema, await readJson(request));
  return NextResponse.json({ order: await recutOrder(user, id, input) });
});

/** GET /api/orders/:id */
export const getOrderHandler = apiHandler(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requireApiUser(request, "orders:read");
  const id = parseId((await params).id, "Cutting order");
  return NextResponse.json({ order: await getOrderDetail(id) });
});
