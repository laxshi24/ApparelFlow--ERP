import { CheckCircle2, History, XCircle } from "lucide-react";
import { EmptyState } from "@/components/ui/feedback";
import type { OrderDecision } from "@/features/cutting-orders/server/order-queries";
import { ComponentCountsTable } from "@/features/cutting-orders/ui/component-counts-table";
import { WastageValue } from "@/features/cutting-orders/ui/order-summary";
import { formatDateTime, formatYards } from "@/lib/format";

/** Immutable verification decisions, newest first, each with its frozen component snapshot. */
export function DecisionHistory({ decisions }: { decisions: OrderDecision[] }) {
  if (decisions.length === 0) {
    return (
      <EmptyState icon={History} title="No verification decisions yet">
        Decisions appear here once a Cutting Verifier approves or rejects this batch.
      </EmptyState>
    );
  }
  return (
    <ol className="space-y-4">
      {[...decisions].reverse().map((d) => {
        const approved = d.decision === "APPROVED";
        const Icon = approved ? CheckCircle2 : XCircle;
        return (
          <li key={d.id} className={`rounded-md border p-4 ${approved ? "border-ok-line" : "border-bad-line"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className={`flex items-center gap-2 font-semibold ${approved ? "text-ok" : "text-bad"}`}>
                <Icon aria-hidden className="size-5" />
                Attempt {d.attemptNo}: {approved ? "Approved" : "Rejected"}
              </p>
              <p className="text-sm text-ink">
                by <strong>{d.verifierName}</strong> · <time dateTime={new Date(d.timestamp).toISOString()}>{formatDateTime(d.timestamp)}</time>
              </p>
            </div>
            {d.rejectionNote && (
              <blockquote className="mt-3 rounded-md border-l-4 border-bad bg-bad-bg px-3 py-2 text-sm text-ink">
                <span className="font-semibold">Rejection reason: </span>
                {d.rejectionNote}
              </blockquote>
            )}
            <p className="mt-3 text-sm text-ink">
              Fabric roll <span className="font-mono">{d.fabricRollId}</span> · {formatYards(d.actualFabricYds)} used of{" "}
              {formatYards(d.expectedFabricYds)} standard · wastage{" "}
              <WastageValue pct={d.wastagePct} cap={d.wastageCapPct} exceeds={d.wastagePct > d.wastageCapPct} />
            </p>
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-semibold text-brand">Component counts recorded at decision time</summary>
              <div className="mt-3">
                <ComponentCountsTable
                  caption={`Component snapshot for attempt ${d.attemptNo}`}
                  rows={d.componentVariances.map((c) => ({ key: c.componentId, ...c }))}
                />
              </div>
            </details>
          </li>
        );
      })}
    </ol>
  );
}
