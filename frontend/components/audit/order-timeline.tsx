import { CheckCircle2, ClipboardList, Hammer, ListChecks, RotateCcw, XCircle, type LucideIcon } from "lucide-react";
import { formatDateTime, formatYards } from "@shared/format";
import { ROLE_LABELS, isRole } from "@shared/permissions";
import type { AuditEventType } from "@backend/db/schema";
import type { TimelineEvent } from "@backend/services/audit/audit.service";

const EVENT: Partial<Record<AuditEventType, { label: string; icon: LucideIcon; tone: string }>> = {
  ORDER_CREATED: { label: "Order created", icon: ClipboardList, tone: "text-info" },
  COUNTS_RECORDED: { label: "Counts recorded", icon: ListChecks, tone: "text-ink" },
  ORDER_APPROVED: { label: "Approved — verified", icon: CheckCircle2, tone: "text-ok" },
  ORDER_REJECTED: { label: "Rejected", icon: XCircle, tone: "text-bad" },
  RECUT_SUBMITTED: { label: "Re-cut submitted", icon: RotateCcw, tone: "text-warn" },
  SEWING_STARTED: { label: "Sewing assembly started", icon: Hammer, tone: "text-ok" },
};

type Payload = Record<string, unknown>;
const num = (v: unknown) => (typeof v === "number" ? v : null);
const str = (v: unknown) => (typeof v === "string" ? v : null);

function describe(type: AuditEventType, p: Payload): string | null {
  switch (type) {
    case "ORDER_CREATED":
      return `${num(p.targetQty) ?? "?"} garments of ${str(p.recipeCode) ?? "?"} from roll ${str(p.fabricRollId) ?? "?"}, ${formatYards(num(p.actualFabricYds) ?? 0)} used`;
    case "COUNTS_RECORDED": {
      const changes = Array.isArray(p.changes) ? p.changes.length : 0;
      return `${changes} component count(s) updated on attempt ${num(p.attemptNo) ?? "?"}`;
    }
    case "ORDER_APPROVED":
      return `Attempt ${num(p.attemptNo) ?? "?"} approved · fabric wastage ${num(p.wastagePct) ?? "?"}%`;
    case "ORDER_REJECTED":
      return `Attempt ${num(p.attemptNo) ?? "?"}: “${str(p.reason) ?? ""}”`;
    case "RECUT_SUBMITTED": {
      const prev = (p.previous ?? {}) as Payload;
      const cur = (p.current ?? {}) as Payload;
      return `Attempt ${num(p.newAttempt) ?? "?"} opened: “${str(p.note) ?? ""}” · roll ${str(prev.fabricRollId)} → ${str(cur.fabricRollId)}, ${formatYards(num(prev.actualFabricYds) ?? 0)} → ${formatYards(num(cur.actualFabricYds) ?? 0)}`;
    }
    default:
      return null;
  }
}

/** Read-only rendering of the append-only audit trail for one order. */
export function OrderTimeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) return <p className="text-sm text-ink-muted">No events recorded.</p>;
  return (
    <ol className="relative space-y-5 border-l-2 border-line pl-6">
      {events.map((e) => {
        const spec = EVENT[e.eventType] ?? { label: e.eventType, icon: ListChecks, tone: "text-ink" };
        const Icon = spec.icon;
        const detail = describe(e.eventType, e.payload);
        return (
          <li key={e.id} className="relative">
            <span className="absolute -left-[2.15rem] top-0 grid size-7 place-items-center rounded-full border border-line bg-surface">
              <Icon aria-hidden className={`size-4 ${spec.tone}`} />
            </span>
            <p className={`text-sm font-semibold ${spec.tone}`}>{spec.label}</p>
            <p className="text-sm text-ink">
              {e.actorName ?? "System"}
              {e.actorRole && isRole(e.actorRole) && <span className="text-ink-muted"> ({ROLE_LABELS[e.actorRole]})</span>} ·{" "}
              <time dateTime={new Date(e.occurredAt).toISOString()}>{formatDateTime(e.occurredAt)}</time>
            </p>
            {detail && <p className="mt-0.5 break-words text-sm text-ink-muted">{detail}</p>}
          </li>
        );
      })}
    </ol>
  );
}
