import { TrafficLightBadge } from "@/components/status/status-badges";
import { formatInt } from "@/lib/format";
import type { ComponentStatus } from "@/lib/database/schema";

export type CountRow = {
  key: string;
  componentName: string;
  piecesPerGarment: number;
  expectedQty: number;
  actualQty: number | null;
  status: ComponentStatus | null;
};

function variance(row: CountRow) {
  if (row.actualQty === null) return "—";
  const v = row.actualQty - row.expectedQty;
  return v === 0 ? "0" : v > 0 ? `+${formatInt(v)}` : `−${formatInt(-v)}`;
}

/** Read-only expected vs actual table with traffic-light status (text + icon + colour). */
export function ComponentCountsTable({ rows, caption }: { rows: CountRow[]; caption: string }) {
  return (
    <div className="overflow-x-auto rounded-md border border-line">
      <table className="w-full min-w-[40rem] text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-neutral-bg text-left text-ink">
          <tr>
            <th scope="col" className="px-3 py-2 font-semibold">Component</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Per garment</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Expected</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Actual</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Variance</th>
            <th scope="col" className="px-3 py-2 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={row.key}>
              <td className="px-3 py-2 font-medium text-ink">{row.componentName}</td>
              <td className="px-3 py-2 text-right tabular-nums text-ink">×{row.piecesPerGarment}</td>
              <td className="px-3 py-2 text-right tabular-nums text-ink">{formatInt(row.expectedQty)}</td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums text-ink">{row.actualQty === null ? "—" : formatInt(row.actualQty)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-ink">{variance(row)}</td>
              <td className="px-3 py-2">
                <TrafficLightBadge status={row.status} size="sm" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
