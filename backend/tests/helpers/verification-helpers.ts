import {
  approveHandler,
  getVerificationHandler,
  rejectHandler,
  saveCountsHandler,
} from "@backend/controllers/verification.controller";
import { call } from "@backend/tests/helpers/http";

export type Item = { id: string; componentName: string; expectedQty: number; actualQty: number | null; status: string | null };

export async function getItems(cookie: string, orderId: string): Promise<Item[]> {
  const res = await call(getVerificationHandler, "GET", `/api/verification/${orderId}`, { cookie, params: { orderId } });
  if (res.status !== 200) throw new Error(`getItems failed ${res.status}`);
  return res.body.order.items;
}

/** Builds count entries from the current items using a per-item rule. */
export async function buildCounts(cookie: string, orderId: string, rule: (item: Item, index: number) => number | null) {
  const items = await getItems(cookie, orderId);
  return items.map((item, i) => ({ itemId: item.id, actualQty: rule(item, i) }));
}

export const saveCounts = (cookie: string, orderId: string, counts: unknown) =>
  call(saveCountsHandler, "PUT", `/api/verification/${orderId}/counts`, { cookie, body: { counts }, params: { orderId } });

export const approve = (cookie: string | undefined, orderId: string, body: unknown = {}) =>
  call(approveHandler, "POST", `/api/verification/${orderId}/approve`, { cookie, body, params: { orderId } });

export const reject = (cookie: string | undefined, orderId: string, body: unknown) =>
  call(rejectHandler, "POST", `/api/verification/${orderId}/reject`, { cookie, body, params: { orderId } });

/** Counts every component exactly as expected and approves. */
export async function countExactAndApprove(verifier: string, orderId: string) {
  const counts = await buildCounts(verifier, orderId, (item) => item.expectedQty);
  const res = await approve(verifier, orderId, { counts });
  if (res.status !== 200) throw new Error(`approve failed ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.result;
}
