import { AlertTriangle, History } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AccessDenied } from "@frontend/components/layout/access-denied";
import { Card, CardBody, CardHeader, PageHeader } from "@frontend/components/ui/card";
import { EmptyState, PageSkeleton } from "@frontend/components/ui/feedback";
import { Pagination } from "@frontend/components/ui/pagination";
import { getAuditSummary, listDecisions } from "@backend/services/audit/audit.service";
import { WastageValue } from "@frontend/components/orders/order-summary";
import { requirePageUser } from "@backend/middleware/auth";
import { formatDateTime, formatPct } from "@shared/format";

export const metadata: Metadata = { title: "Audit history" };

export default function AuditPage({ searchParams }: PageProps<"/audit">) {
  return (
    <>
      <PageHeader
        title="Audit history"
        description="Read-only record of every verification decision, with wastage metrics computed from the values recorded at decision time."
      />
      <Suspense fallback={<PageSkeleton label="Loading audit history" />}>
        <AuditContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4 shadow-sm">
      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-bold tabular-nums text-ink">{value}</dd>
      {note && <dd className="mt-0.5 text-sm text-ink-muted">{note}</dd>}
    </div>
  );
}

async function AuditContent({ searchParams }: { searchParams: PageProps<"/audit">["searchParams"] }) {
  const { user, allowed } = await requirePageUser("audit:read");
  if (!allowed) return <AccessDenied role={user.role} what="view the audit history" />;
  const { page: rawPage } = await searchParams;
  const page = Math.min(10_000, Math.max(1, Number.parseInt(typeof rawPage === "string" ? rawPage : "1", 10) || 1));
  const [summary, decisions] = await Promise.all([getAuditSummary(), listDecisions(page)]);
  const s = summary.ordersByStatus;

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Pending verification" value={String(s.PENDING_VERIFICATION)} />
        <Stat label="Verified" value={String(s.VERIFIED)} note={`${summary.sewingStarted} in sewing`} />
        <Stat label="Rejected (open)" value={String(s.REJECTED)} />
        <Stat label="Decisions" value={String(summary.approvals + summary.rejections)} note={`${summary.approvals} approved · ${summary.rejections} rejected`} />
        <Stat
          label="First-pass approval"
          value={summary.firstPassRatePct === null ? "—" : `${summary.firstPassRatePct.toFixed(1)}%`}
          note="Verified without a prior rejection"
        />
      </dl>

      <Card>
        <CardHeader title="Fabric wastage by recipe" description="Approved batches only. Positive = more fabric than standard; negative = saving." />
        <CardBody>
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="w-full min-w-[40rem] text-sm">
              <caption className="sr-only">Fabric wastage by recipe</caption>
              <thead className="bg-neutral-bg text-left text-ink">
                <tr>
                  <th scope="col" className="px-3 py-2 font-semibold">Recipe</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">Approved batches</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">Average wastage</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">Maximum</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">Cap</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">Over cap</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {summary.wastageByRecipe.map((r) => (
                  <tr key={r.recipeCode}>
                    <td className="px-3 py-2 text-ink">
                      <span className="font-mono text-xs text-ink-muted">{r.recipeCode}</span> {r.recipeName}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink">{r.approvedBatches}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink">{r.avgWastagePct === null ? "—" : formatPct(r.avgWastagePct)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink">{r.maxWastagePct === null ? "—" : formatPct(r.maxWastagePct)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink">{formatPct(r.wastageCapPct, { signed: false })}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.overCapBatches > 0 ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-warn">
                          <AlertTriangle aria-hidden className="size-4" /> {r.overCapBatches} over cap
                        </span>
                      ) : (
                        <span className="text-ink">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Verification decisions" description="Newest first. Entries cannot be edited or deleted." />
        <CardBody className="space-y-4">
          {decisions.rows.length === 0 ? (
            <EmptyState icon={History} title="No decisions recorded yet" />
          ) : (
            <>
              <div className="overflow-x-auto rounded-md border border-line">
                <table className="w-full min-w-[56rem] text-sm">
                  <caption className="sr-only">Verification decisions</caption>
                  <thead className="bg-neutral-bg text-left text-ink">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-semibold">When</th>
                      <th scope="col" className="px-3 py-2 font-semibold">Order</th>
                      <th scope="col" className="px-3 py-2 font-semibold">Decision</th>
                      <th scope="col" className="px-3 py-2 font-semibold">Verifier</th>
                      <th scope="col" className="px-3 py-2 font-semibold">Wastage</th>
                      <th scope="col" className="px-3 py-2 font-semibold">Rejection reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {decisions.rows.map((d) => (
                      <tr key={d.id}>
                        <td className="whitespace-nowrap px-3 py-2 text-ink">{formatDateTime(d.timestamp)}</td>
                        <td className="px-3 py-2">
                          <Link href={`/orders/${d.orderId}`} className="font-mono font-semibold text-brand hover:underline">
                            {d.orderNo}
                          </Link>
                          <span className="block text-xs text-ink-muted">
                            {d.recipeCode} · attempt {d.attemptNo}
                          </span>
                        </td>
                        <td className={`px-3 py-2 font-semibold ${d.decision === "APPROVED" ? "text-ok" : "text-bad"}`}>
                          {d.decision === "APPROVED" ? "✓ Approved" : "✕ Rejected"}
                        </td>
                        <td className="px-3 py-2 text-ink">{d.verifierName}</td>
                        <td className="px-3 py-2">
                          <WastageValue pct={d.wastagePct} cap={d.wastageCapPct} exceeds={d.wastagePct > d.wastageCapPct} />
                        </td>
                        <td className="max-w-xs break-words px-3 py-2 text-ink">{d.rejectionNote ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                noun="decisions"
                page={decisions.page}
                pageSize={decisions.pageSize}
                total={decisions.total}
                hrefForPage={(p) => (p > 1 ? `/audit?page=${p}` : "/audit")}
              />
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
