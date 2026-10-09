import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AccessDenied } from "@/components/layout/access-denied";
import { OrderStatusBadge } from "@/components/status/status-badges";
import { LinkButton } from "@/components/ui/button";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { Alert, PageSkeleton } from "@/components/ui/feedback";
import { getOrderDetail } from "@/features/cutting-orders/server/order-queries";
import { OrderSummary } from "@/features/cutting-orders/ui/order-summary";
import { DecisionHistory } from "@/features/verification/ui/decision-history";
import { VerificationTerminal } from "@/features/verification/ui/verification-terminal";
import { requirePageUser } from "@/lib/auth/guards";
import { NotFoundError } from "@/lib/errors";
import { isUuid } from "@/lib/validation";

export const metadata: Metadata = { title: "Verification terminal" };

export default function VerificationTerminalPage({ params }: PageProps<"/verification/[orderId]">) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading verification terminal" />}>
      <TerminalContent params={params} />
    </Suspense>
  );
}

async function TerminalContent({ params }: { params: PageProps<"/verification/[orderId]">["params"] }) {
  const { user, allowed } = await requirePageUser("verification:read");
  if (!allowed) return <AccessDenied role={user.role} what="use the verification terminal" />;
  const { orderId } = await params;
  if (!isUuid(orderId)) notFound();
  const order = await getOrderDetail(orderId).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  const previousRejection = order.decisions.filter((d) => d.decision === "REJECTED").at(-1);

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-mono">{order.orderNo}</span>
            <OrderStatusBadge status={order.status} />
          </span>
        }
        description={`${order.recipe.recipeCode} · ${order.recipe.name} · ${order.targetQty} garments · attempt ${order.currentAttempt}`}
        actions={
          <LinkButton href="/verification" variant="secondary">
            <ArrowLeft aria-hidden className="size-4" /> Verification queue
          </LinkButton>
        }
      />
      <div className="space-y-6">
        {order.status !== "PENDING_VERIFICATION" ? (
          <Alert tone="info" title={`This batch is ${order.status === "VERIFIED" ? "already verified" : "rejected"}`}>
            Counts are locked once a decision is recorded. See the decision history below.
          </Alert>
        ) : (
          <>
            {previousRejection && (
              <Alert tone="warning" title={`Re-cut submitted after rejection on attempt ${previousRejection.attemptNo}`}>
                Previous reason: “{previousRejection.rejectionNote}”. Count every component again — earlier counts do not carry over.
              </Alert>
            )}
            <Card>
              <CardHeader
                title="Count components"
                description="Enter the physical count for each component. GREEN = exact, YELLOW = surplus, RED = shortage. Counts save automatically."
              />
              <CardBody>
                <VerificationTerminal
                  orderId={order.id}
                  orderNo={order.orderNo}
                  items={order.items}
                  wastage={{ pct: order.fabric.wastagePct, cap: order.recipe.wastageCap, exceeds: order.fabric.exceedsCap }}
                />
              </CardBody>
            </Card>
          </>
        )}
        <Card>
          <CardHeader title="Batch details" />
          <CardBody>
            <OrderSummary order={order} />
          </CardBody>
        </Card>
        {order.decisions.length > 0 && (
          <Card>
            <CardHeader title="Verification history" />
            <CardBody>
              <DecisionHistory decisions={order.decisions} />
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
