import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser } from "@/lib/auth/guards";
import { apiHandler } from "@/lib/http/api-handler";
import { parseId, parseOrThrow, readJson } from "@/lib/validation";
import { createOrderSchema, listOrdersQuerySchema } from "../schemas/order.schema";
import { createCuttingOrder } from "./create-order";
import { getOrderDetail, listOrders } from "./order-queries";

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

/** GET /api/orders/:id */
export const getOrderHandler = apiHandler(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requireApiUser(request, "orders:read");
  const id = parseId((await params).id, "Cutting order");
  return NextResponse.json({ order: await getOrderDetail(id) });
});
