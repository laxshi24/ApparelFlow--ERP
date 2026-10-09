import { ArrowUpCircle, CheckCircle2, CircleDashed, Clock, Hammer, ShieldCheck, XCircle, XOctagon, type LucideIcon } from "lucide-react";
import { cn } from "@/components/ui/cn";
import type { ComponentStatus, OrderStatus } from "@/lib/database/schema";

type BadgeSpec = { label: string; icon: LucideIcon; classes: string };

function Badge({ spec, className, size = "md" }: { spec: BadgeSpec; className?: string; size?: "sm" | "md" }) {
  const Icon = spec.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border font-semibold",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm",
        spec.classes,
        className,
      )}
    >
      <Icon aria-hidden className={size === "sm" ? "size-3.5" : "size-4"} />
      {spec.label}
    </span>
  );
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING_VERIFICATION: "Pending verification",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
};

const ORDER_STATUS: Record<OrderStatus, BadgeSpec> = {
  PENDING_VERIFICATION: { label: ORDER_STATUS_LABELS.PENDING_VERIFICATION, icon: Clock, classes: "border-info-line bg-info-bg text-info" },
  VERIFIED: { label: ORDER_STATUS_LABELS.VERIFIED, icon: ShieldCheck, classes: "border-ok-line bg-ok-bg text-ok" },
  REJECTED: { label: ORDER_STATUS_LABELS.REJECTED, icon: XCircle, classes: "border-bad-line bg-bad-bg text-bad" },
};

export function OrderStatusBadge({ status, size }: { status: OrderStatus; size?: "sm" | "md" }) {
  return <Badge spec={ORDER_STATUS[status]} size={size} />;
}

/** Traffic light: colour is never the only signal — every state has an icon and a text label. */
export const TRAFFIC_LIGHT: Record<ComponentStatus | "UNCOUNTED", BadgeSpec & { description: string }> = {
  GREEN: { label: "GREEN · Match", description: "Actual equals expected", icon: CheckCircle2, classes: "border-ok-line bg-ok-bg text-ok" },
  YELLOW: { label: "YELLOW · Surplus", description: "Actual exceeds expected", icon: ArrowUpCircle, classes: "border-warn-line bg-warn-bg text-warn" },
  RED: { label: "RED · Shortage", description: "Actual is below expected", icon: XOctagon, classes: "border-bad-line bg-bad-bg text-bad" },
  UNCOUNTED: { label: "Not counted", description: "No count entered yet", icon: CircleDashed, classes: "border-line-strong bg-neutral-bg text-ink" },
};

export function TrafficLightBadge({ status, size }: { status: ComponentStatus | null; size?: "sm" | "md" }) {
  return <Badge spec={TRAFFIC_LIGHT[status ?? "UNCOUNTED"]} size={size} />;
}

export function SewingStatusBadge({ started, size }: { started: boolean; size?: "sm" | "md" }) {
  return (
    <Badge
      size={size}
      spec={
        started
          ? { label: "Assembly in progress", icon: Hammer, classes: "border-ok-line bg-ok-bg text-ok" }
          : { label: "Awaiting assembly", icon: Clock, classes: "border-info-line bg-info-bg text-info" }
      }
    />
  );
}
