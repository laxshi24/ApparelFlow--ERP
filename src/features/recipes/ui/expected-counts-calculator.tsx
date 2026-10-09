"use client";

import { Calculator } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Alert } from "@/components/ui/feedback";
import { describedBy, Field, Input } from "@/components/ui/form";
import { formatInt, formatYards } from "@/lib/format";
import { ApiClientError, apiFetch } from "@/lib/http/client";
import type { RecipeBreakdown } from "../server/recipe-queries";

/**
 * Dynamic expected-count calculator. The numbers shown come from the server endpoint
 * GET /api/recipes/:id/breakdown, not from client arithmetic.
 */
export function ExpectedCountsCalculator({ recipeId, initialQty = 50 }: { recipeId: string; initialQty?: number }) {
  const inputId = useId();
  const [qty, setQty] = useState(String(initialQty));
  const [breakdown, setBreakdown] = useState<RecipeBreakdown | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await apiFetch<{ breakdown: RecipeBreakdown }>(
          `/api/recipes/${recipeId}/breakdown?qty=${encodeURIComponent(qty)}`,
          { signal: controller.signal },
        );
        setBreakdown(res.breakdown);
        setError(null);
      } catch (err) {
        if (controller.signal.aborted) return;
        setBreakdown(null);
        setError(err instanceof ApiClientError ? (err.fieldErrors().qty ?? err.message) : "Could not calculate");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [qty, recipeId]);

  return (
    <div className="space-y-4">
      <Field id={inputId} label="Target batch quantity (garments)" required error={error ?? undefined} hint="Whole number between 1 and 100,000.">
        <Input
          id={inputId}
          inputMode="numeric"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          invalid={!!error}
          aria-describedby={describedBy(inputId, error ?? undefined, true)}
          className="max-w-48"
        />
      </Field>

      <div aria-live="polite" aria-busy={loading}>
        {breakdown && !error ? (
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="w-full min-w-[28rem] text-sm">
              <caption className="sr-only">Expected component counts for {formatInt(breakdown.targetQty)} garments</caption>
              <thead className="bg-neutral-bg text-left text-ink">
                <tr>
                  <th scope="col" className="px-3 py-2 font-semibold">Component</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">Per garment</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">Expected pieces</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {breakdown.components.map((c) => (
                  <tr key={c.id}>
                    <td className="px-3 py-2 text-ink">{c.componentName}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink">× {c.piecesPerGarment}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-ink">{formatInt(c.expectedQty)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-line bg-neutral-bg text-ink">
                <tr>
                  <th scope="row" className="px-3 py-2 text-left font-semibold">Total pieces</th>
                  <td />
                  <td className="px-3 py-2 text-right font-bold tabular-nums">{formatInt(breakdown.totalPieces)}</td>
                </tr>
                <tr>
                  <th scope="row" className="px-3 py-2 text-left font-semibold">Standard fabric</th>
                  <td />
                  <td className="px-3 py-2 text-right font-bold tabular-nums">{formatYards(breakdown.expectedFabricYds)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : !error ? (
          <p className="flex items-center gap-2 text-sm text-ink-muted">
            <Calculator aria-hidden className="size-4" /> Calculating…
          </p>
        ) : (
          <Alert tone="warning">Enter a valid quantity to see expected component counts.</Alert>
        )}
      </div>
    </div>
  );
}
