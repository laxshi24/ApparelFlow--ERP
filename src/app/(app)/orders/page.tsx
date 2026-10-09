import { ClipboardList, Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AccessDenied } from "@/components/layout/access-denied";
import { ORDER_STATUS_LABELS, OrderStatusBadge } from "@/components/status/status-badges";
import { Button, LinkButton } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/card";
import { EmptyState, PageSkeleton } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/form";
import { Pagination } from "@/components/ui/pagination";
import { listOrdersQuerySchema, type ListOrdersQuery } from "@/features/cutting-orders/schemas/order.schema";
import { listOrders } from "@/features/cutting-orders/server/order-queries";
import { requirePageUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { orderStatus } from "@/lib/database/schema";
import { formatDateTime, formatInt, formatYards } from "@/lib/format";

export const metadata: Metadata = { title: "Cutting orders" };

export default function OrdersPage({ searchParams }: PageProps<"/orders">) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading cutting orders" />}>
      <OrdersContent searchParams={searchParams} />
    </Suspense>
  );
}

function hrefFor(query: ListOrdersQuery, page: number) {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.status) params.set("status", query.status);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/orders?${qs}` : "/orders";
}

async function OrdersContent({ searchParams }: { searchParams: PageProps<"/orders">["searchParams"] }) {
  const { user, allowed } = await requirePageUser("orders:read");
  if (!allowed) return <AccessDenied role={user.role} what="view cutting orders" />;

  const raw = await searchParams;
  const query = listOrdersQuerySchema.parse({
    q: typeof raw.q === "string" ? raw.q : undefined,
    status: typeof raw.status === "string" ? raw.status : undefined,
    page: typeof raw.page === "string" ? raw.page : undefined,
  });
  const { orders, total, page, pageSize } = await listOrders(query);
  const filtered = Boolean(query.q || query.status);

  return (
    <>
      <PageHeader
        title="Cutting orders"
        description="All cutting batches across the factory floor, with their verification outcome."
        actions={
          can(user.role, "orders:create") && (
            <LinkButton href="/orders/new">
              <Plus aria-hidden className="size-4" /> New cutting order
            </LinkButton>
          )
        }
      />

      <form method="get" action="/orders" role="search" className="mb-5 grid grid-cols-1 gap-3 rounded-lg border border-line bg-surface p-4 shadow-sm sm:grid-cols-[minmax(0,1fr)_14rem_auto] sm:items-end">
        <div className="space-y-1.5">
          <label htmlFor="q" className="block text-sm font-semibold text-ink">
            Search
          </label>
          <Input id="q" name="q" type="search" defaultValue={query.q ?? ""} placeholder="Order no., fabric roll, recipe…" maxLength={64} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="status" className="block text-sm font-semibold text-ink">
            Status
          </label>
          <Select id="status" name="status" defaultValue={query.status ?? ""}>
            <option value="">All statuses</option>
            {orderStatus.enumValues.map((s) => (
              <option key={s} value={s}>
                {ORDER_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex gap-2">
          <Button type="submit" variant="secondary">
            <Search aria-hidden className="size-4" /> Apply
          </Button>
          {filtered && (
            <LinkButton href="/orders" variant="ghost">
              Clear
            </LinkButton>
          )}
        </div>
      </form>

      {orders.length === 0 ? (
        <EmptyState icon={ClipboardList} title={filtered ? "No orders match your filters" : "No cutting orders yet"}>
          {filtered
            ? "Try a different search term or status."
            : can(user.role, "orders:create")
              ? "Create the first cutting order to start the verification workflow."
              : "Cutting supervisors have not created any orders yet."}
        </EmptyState>
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-lg border border-line bg-surface shadow-sm">
            <table className="w-full min-w-[52rem] text-sm">
              <caption className="sr-only">Cutting orders</caption>
              <thead className="border-b border-line bg-neutral-bg text-left text-ink">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Order</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Recipe</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Garments</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Fabric roll</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Fabric used</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {orders.map((o) => (
                  <tr key={o.id} className="hover:bg-neutral-bg">
                    <td className="px-4 py-3">
                      <Link href={`/orders/${o.id}`} className="whitespace-nowrap font-mono font-semibold text-brand underline-offset-2 hover:underline">
                        {o.orderNo}
                      </Link>
                      {o.currentAttempt > 1 && <span className="ml-2 text-xs font-semibold text-ink-muted">Re-cut #{o.currentAttempt - 1}</span>}
                    </td>
                    <td className="px-4 py-3 text-ink">
                      <span className="font-mono text-xs text-ink-muted">{o.recipeCode}</span>
                      <br />
                      {o.recipeName}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink">{formatInt(o.targetQty)}</td>
                    <td className="px-4 py-3 font-mono text-ink">{o.fabricRollId}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink">{formatYards(o.actualFabricYds)}</td>
                    <td className="px-4 py-3">
                      <OrderStatusBadge status={o.status} size="sm" />
                    </td>
                    <td className="px-4 py-3 text-ink">
                      {formatDateTime(o.createdAt)}
                      <br />
                      <span className="text-ink-muted">{o.createdByName}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination noun="orders" page={page} pageSize={pageSize} total={total} hrefForPage={(p) => hrefFor(query, p)} />
        </div>
      )}
    </>
  );
}
