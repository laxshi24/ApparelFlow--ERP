import { ClipboardCheck, Inbox } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/layout/access-denied";
import { LinkButton } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/card";
import { Alert, EmptyState, PageSkeleton } from "@/components/ui/feedback";
import { listPendingVerification } from "@/features/verification/server/verification-queries";
import { requirePageUser } from "@/lib/auth/guards";
import { formatDateTime, formatInt } from "@/lib/format";

export const metadata: Metadata = { title: "Verification queue" };

export default function VerificationQueuePage({ searchParams }: PageProps<"/verification">) {
  return (
    <>
      <PageHeader
        title="Verification queue"
        description="Batches awaiting a physical component count, oldest first. Only fully counted batches without shortages can be approved."
      />
      <Suspense fallback={<PageSkeleton label="Loading verification queue" />}>
        <QueueContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function QueueContent({ searchParams }: { searchParams: PageProps<"/verification">["searchParams"] }) {
  const { user, allowed } = await requirePageUser("verification:read");
  if (!allowed) return <AccessDenied role={user.role} what="use the verification terminal" />;
  const { decided, order } = await searchParams;
  const orders = await listPendingVerification();
  const orderNo = typeof order === "string" ? order.slice(0, 32) : null;

  return (
    <div className="space-y-5">
      {decided === "approved" && orderNo && (
        <Alert tone="success" title={`${orderNo} approved`}>
          The batch is verified and now visible in the Sewing Queue.
        </Alert>
      )}
      {decided === "rejected" && orderNo && (
        <Alert tone="warning" title={`${orderNo} rejected`}>
          The Cutting Supervisor can review the reason and submit a re-cut.
        </Alert>
      )}

      {orders.length === 0 ? (
        <EmptyState icon={Inbox} title="Nothing to verify">
          New cutting orders and re-cuts will appear here as soon as supervisors submit them.
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {orders.map((o) => {
            const progress = o.itemCount === 0 ? 0 : Math.round((o.countedCount / o.itemCount) * 100);
            return (
              <li key={o.id} className="flex flex-col rounded-lg border border-line bg-surface p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-base font-bold text-ink">{o.orderNo}</p>
                    <p className="text-sm text-ink">
                      <span className="font-mono text-ink-muted">{o.recipeCode}</span> · {o.recipeName}
                    </p>
                  </div>
                  {o.currentAttempt > 1 && (
                    <span className="shrink-0 rounded-full border border-warn-line bg-warn-bg px-2 py-0.5 text-xs font-semibold text-warn">
                      Re-cut #{o.currentAttempt - 1}
                    </span>
                  )}
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Garments</dt>
                    <dd className="font-semibold tabular-nums text-ink">{formatInt(o.targetQty)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Submitted</dt>
                    <dd className="text-ink">{formatDateTime(o.createdAt)}</dd>
                  </div>
                </dl>
                <div className="mt-3">
                  <div className="flex justify-between text-xs font-semibold text-ink">
                    <span id={`progress-${o.id}`}>
                      Counted {o.countedCount} of {o.itemCount} components
                    </span>
                    {o.shortCount > 0 && <span className="text-bad">{o.shortCount} short</span>}
                  </div>
                  <div
                    role="progressbar"
                    aria-labelledby={`progress-${o.id}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={progress}
                    className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200"
                  >
                    <div className="h-full rounded-full bg-brand" style={{ width: `${progress}%` }} />
                  </div>
                </div>
                <LinkButton href={`/verification/${o.id}`} className="mt-4" aria-label={`Verify ${o.orderNo}`}>
                  <ClipboardCheck aria-hidden className="size-4" /> {o.countedCount > 0 ? "Continue counting" : "Start counting"}
                </LinkButton>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
