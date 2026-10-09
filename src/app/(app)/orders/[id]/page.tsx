import { ArrowLeft, ClipboardCheck } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AccessDenied } from "@/components/layout/access-denied";
import { OrderStatusBadge, SewingStatusBadge } from "@/components/status/status-badges";
import { LinkButton } from "@/components/ui/button";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { Alert, PageSkeleton } from "@/components/ui/feedback";
import { getOrderDetail } from "@/features/cutting-orders/server/order-queries";
import { ComponentCountsTable } from "@/features/cutting-orders/ui/component-counts-table";
import { OrderSummary } from "@/features/cutting-orders/ui/order-summary";
import { RecutForm } from "@/features/cutting-orders/ui/recut-form";
import { DecisionHistory } from "@/features/verification/ui/decision-history";
import { getOrderTimeline } from "@/features/audit/server/audit-queries";
import { OrderTimeline } from "@/features/audit/ui/order-timeline";
import { requirePageUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { NotFoundError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { isUuid } from "@/lib/validation";

export const metadata: Metadata = { title: "Cutting order" };

export default function OrderDetailPage({ params, searchParams }: PageProps<"/orders/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading cutting order" />}>
      <OrderDetailContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function OrderDetailContent({
  params,
  searchParams,
}: {
  params: PageProps<"/orders/[id]">["params"];
  searchParams: PageProps<"/orders/[id]">["searchParams"];
}) {
  const { user, allowed } = await requirePageUser("orders:read");
  if (!allowed) return <AccessDenied role={user.role} what="view cutting orders" />;
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const order = await getOrderDetail(id).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  const timeline = await getOrderTimeline(order.id);
  const { created } = await searchParams;
  const latestDecision = order.decisions.at(-1);

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-mono">{order.orderNo}</span>
            <OrderStatusBadge status={order.status} />
          </span>
        }
        description={`${order.recipe.name} · ${order.targetQty} garments`}
        actions={
          <>
            <LinkButton href="/orders" variant="secondary">
              <ArrowLeft aria-hidden className="size-4" /> Cutting orders
            </LinkButton>
            {can(user.role, "verification:count") && order.status === "PENDING_VERIFICATION" && (
              <LinkButton href={`/verification/${order.id}`}>
                <ClipboardCheck aria-hidden className="size-4" /> Open verification terminal
              </LinkButton>
            )}
          </>
        }
      />

      <div className="space-y-6">
        {created === "1" && (
          <Alert tone="success" title={`Order ${order.orderNo} created`}>
            It is now waiting in the verification queue. Expected component counts were calculated from the recipe.
          </Alert>
        )}
        {order.status === "REJECTED" && latestDecision?.rejectionNote && (
          <Alert tone="error" title={`Rejected by ${latestDecision.verifierName} · ${formatDateTime(latestDecision.timestamp)}`}>
            <p>
              <strong>Reason:</strong> {latestDecision.rejectionNote}
            </p>
          </Alert>
        )}
        {order.status === "VERIFIED" && (
          <Alert tone="success" title="Verified — released to the Sewing Queue">
            <span className="inline-flex flex-wrap items-center gap-2">
              Sewing status: <SewingStatusBadge started={!!order.sewing} size="sm" />
              {order.sewing && `started by ${order.sewing.startedByName} at ${formatDateTime(order.sewing.startedAt)}`}
            </span>
          </Alert>
        )}

        {order.status === "REJECTED" && can(user.role, "orders:recut") && (
          <Card className="border-warn-line">
            <CardHeader
              title="Correct or re-cut this batch"
              description="Submitting a re-cut sends the batch back to the verification queue as a new attempt."
            />
            <CardBody>
              <RecutForm orderId={order.id} orderNo={order.orderNo} fabricRollId={order.fabricRollId} actualFabricYds={order.actualFabricYds} />
            </CardBody>
          </Card>
        )}

        <Card>
          <CardHeader title="Batch details" />
          <CardBody>
            <OrderSummary order={order} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={`Component counts — attempt ${order.currentAttempt}`}
            description="Expected quantities were derived on the server from the recipe at order creation."
          />
          <CardBody>
            <ComponentCountsTable
              caption={`Component counts for ${order.orderNo}`}
              rows={order.items.map((i) => ({ key: i.id, ...i }))}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Verification decisions" description="Append-only record of every approval and rejection." />
          <CardBody>
            <DecisionHistory decisions={order.decisions} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Order timeline" description="Every recorded event, oldest first." />
          <CardBody>
            <OrderTimeline events={timeline} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
