import { DescriptionList } from "@/components/ui/card";
import { formatDateTime, formatInt, formatPct, formatYards } from "@/lib/format";
import type { OrderDetail } from "../server/order-queries";

export function WastageValue({ pct, cap, exceeds }: { pct: number; cap: number; exceeds: boolean }) {
  return (
    <span className="tabular-nums">
      <strong className={exceeds ? "text-warn" : "text-ink"}>{formatPct(pct)}</strong>{" "}
      <span className="text-ink-muted">
        (cap {formatPct(cap, { signed: false })}
        {exceeds ? " — exceeded" : ""})
      </span>
    </span>
  );
}

export function OrderSummary({ order }: { order: OrderDetail }) {
  return (
    <DescriptionList
      items={[
        { label: "Recipe", value: `${order.recipe.recipeCode} · ${order.recipe.name}` },
        { label: "Target quantity", value: `${formatInt(order.targetQty)} garments` },
        { label: "Fabric roll", value: <span className="font-mono">{order.fabricRollId}</span> },
        { label: "Actual fabric used", value: formatYards(order.actualFabricYds) },
        { label: "Standard fabric", value: `${formatYards(order.fabric.expectedFabricYds)} (${formatYards(order.recipe.stdFabricYards)} × ${formatInt(order.targetQty)})` },
        { label: "Fabric wastage", value: <WastageValue pct={order.fabric.wastagePct} cap={order.recipe.wastageCap} exceeds={order.fabric.exceedsCap} /> },
        { label: "Created by", value: order.createdBy.fullName },
        { label: "Created at", value: formatDateTime(order.createdAt) },
        { label: "Verification attempt", value: order.currentAttempt === 1 ? "1 (original cut)" : `${order.currentAttempt} (re-cut #${order.currentAttempt - 1})` },
      ]}
    />
  );
}
