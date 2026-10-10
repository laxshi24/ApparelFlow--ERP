import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AccessDenied } from "@frontend/components/layout/access-denied";
import { OrderStatusBadge, SewingStatusBadge } from "@frontend/components/status/status-badges";
import { LinkButton } from "@frontend/components/ui/button";
import { Card, CardBody, CardHeader, DescriptionList, PageHeader } from "@frontend/components/ui/card";
import { PageSkeleton } from "@frontend/components/ui/feedback";
import { ComponentCountsTable } from "@frontend/components/orders/component-counts-table";
import { OrderSummary } from "@frontend/components/orders/order-summary";
import { getSewingOrder } from "@backend/services/sewing/sewing-queries.service";
import { StartAssemblyButton } from "@frontend/components/sewing/start-assembly-button";
import { DecisionHistory } from "@frontend/components/verification/decision-history";
import { getOrderTimeline } from "@backend/services/audit/audit.service";
import { OrderTimeline } from "@frontend/components/audit/order-timeline";
import { requirePageUser } from "@backend/middleware/auth";
import { NotFoundError } from "@shared/errors";
import { formatDateTime } from "@shared/format";
import { isUuid } from "@shared/validation/helpers";

export const metadata: Metadata = { title: "Verified batch" };

export default function SewingOrderPage({ params }: PageProps<"/sewing/[orderId]">) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading batch" />}>
      <SewingOrderContent params={params} />
    </Suspense>
  );
}

async function SewingOrderContent({ params }: { params: PageProps<"/sewing/[orderId]">["params"] }) {
  const { user, allowed } = await requirePageUser("sewing:read");
  if (!allowed) return <AccessDenied role={user.role} what="view the Sewing Queue" />;
  const { orderId } = await params;
  if (!isUuid(orderId)) notFound();
  // Non-verified orders are indistinguishable from missing ones for this role.
  const order = await getSewingOrder(orderId).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  const timeline = await getOrderTimeline(order.id);
  const approval = order.decisions.filter((d) => d.decision === "APPROVED").at(-1);

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-mono">{order.orderNo}</span>
            <OrderStatusBadge status={order.status} />
            <SewingStatusBadge started={!!order.sewing} />
          </span>
        }
        description={`${order.recipe.recipeCode} · ${order.recipe.name} · ${order.targetQty} garments`}
        actions={
          <>
            <LinkButton href="/sewing" variant="secondary">
              <ArrowLeft aria-hidden className="size-4" /> Sewing queue
            </LinkButton>
            {!order.sewing && <StartAssemblyButton orderId={order.id} orderNo={order.orderNo} />}
          </>
        }
      />
      <div className="space-y-6">
        <Card>
          <CardHeader title="Verification & sewing" />
          <CardBody>
            <DescriptionList
              items={[
                { label: "Verified by", value: approval?.verifierName ?? "—" },
                { label: "Verified at", value: approval ? formatDateTime(approval.timestamp) : "—" },
                { label: "Verification attempt", value: approval?.attemptNo ?? "—" },
                { label: "Sewing status", value: order.sewing ? "Assembly in progress" : "Awaiting assembly" },
                { label: "Assembly started by", value: order.sewing?.startedByName ?? "—" },
                { label: "Assembly started at", value: order.sewing ? formatDateTime(order.sewing.startedAt) : "—" },
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Component counts" description="Expected vs physically counted pieces at approval." />
          <CardBody>
            <ComponentCountsTable caption={`Component counts for ${order.orderNo}`} rows={order.items.map((i) => ({ key: i.id, ...i }))} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Batch details" />
          <CardBody>
            <OrderSummary order={order} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Verification audit" />
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
