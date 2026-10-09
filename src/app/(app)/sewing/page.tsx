import { Eye, PackageCheck } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/layout/access-denied";
import { SewingStatusBadge } from "@/components/status/status-badges";
import { LinkButton } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/card";
import { EmptyState, PageSkeleton } from "@/components/ui/feedback";
import { WastageValue } from "@/features/cutting-orders/ui/order-summary";
import { listSewingQueue } from "@/features/sewing-queue/server/sewing-queries";
import { StartAssemblyButton } from "@/features/sewing-queue/ui/start-assembly-button";
import { requirePageUser } from "@/lib/auth/guards";
import { formatDateTime, formatInt } from "@/lib/format";

export const metadata: Metadata = { title: "Sewing queue" };

export default function SewingQueuePage() {
  return (
    <>
      <PageHeader
        title="Sewing queue"
        description="Only batches approved by a Cutting Verifier — fully counted with no shortage — appear here."
      />
      <Suspense fallback={<PageSkeleton label="Loading sewing queue" />}>
        <SewingQueueContent />
      </Suspense>
    </>
  );
}

async function SewingQueueContent() {
  const { user, allowed } = await requirePageUser("sewing:read");
  if (!allowed) return <AccessDenied role={user.role} what="view the Sewing Queue" />;
  const orders = await listSewingQueue();

  if (orders.length === 0) {
    return (
      <EmptyState icon={PackageCheck} title="No verified batches yet">
        Batches appear here as soon as a Cutting Verifier approves them.
      </EmptyState>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface shadow-sm">
      <table className="w-full min-w-[60rem] text-sm">
        <caption className="sr-only">Verified batches ready for sewing</caption>
        <thead className="border-b border-line bg-neutral-bg text-left text-ink">
          <tr>
            <th scope="col" className="px-4 py-3 font-semibold">Batch</th>
            <th scope="col" className="px-4 py-3 text-right font-semibold">Garments</th>
            <th scope="col" className="px-4 py-3 font-semibold">Verified by</th>
            <th scope="col" className="px-4 py-3 font-semibold">Fabric wastage</th>
            <th scope="col" className="px-4 py-3 font-semibold">Sewing</th>
            <th scope="col" className="px-4 py-3 text-right font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {orders.map((o) => (
            <tr key={o.id}>
              <td className="px-4 py-3">
                <p className="font-mono font-semibold text-ink">{o.orderNo}</p>
                <p className="text-ink">
                  <span className="font-mono text-xs text-ink-muted">{o.recipeCode}</span> {o.recipeName}
                </p>
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-ink">{formatInt(o.targetQty)}</td>
              <td className="px-4 py-3 text-ink">
                {o.verifierName}
                <br />
                <span className="text-ink-muted">{formatDateTime(o.verifiedAt)}</span>
              </td>
              <td className="px-4 py-3">
                <WastageValue pct={o.wastagePct} cap={o.wastageCapPct} exceeds={o.wastagePct > o.wastageCapPct} />
              </td>
              <td className="px-4 py-3">
                <SewingStatusBadge started={!!o.sewingStartedAt} size="sm" />
                {o.sewingStartedAt && (
                  <p className="mt-1 text-xs text-ink-muted">
                    {o.sewingStartedByName} · {formatDateTime(o.sewingStartedAt)}
                  </p>
                )}
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-2">
                  <LinkButton href={`/sewing/${o.id}`} variant="secondary" size="sm" aria-label={`Inspect ${o.orderNo}`}>
                    <Eye aria-hidden className="size-4" /> Inspect
                  </LinkButton>
                  {!o.sewingStartedAt && <StartAssemblyButton orderId={o.id} orderNo={o.orderNo} size="sm" />}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
