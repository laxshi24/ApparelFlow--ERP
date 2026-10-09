"use client";

import { Info, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { describedBy, Field, Input, Select } from "@/components/ui/form";
import { expectedComponentQuantities, isValidTargetQty } from "@/domain/quantities";
import { calculateWastage } from "@/domain/wastage";
import { formatInt, formatPct, formatYards } from "@/lib/format";
import { ApiClientError, apiFetch } from "@/lib/http/client";
import { firstIssuePerField } from "@/lib/validation";
import type { RecipeDetail } from "@/features/recipes/server/recipe-queries";
import { createOrderSchema } from "../schemas/order.schema";

type CreateResponse = { order: { id: string; orderNo: string } };

/** Parses a numeric text field strictly: "" → null, "12abc" → NaN (Number() rejects partial numbers). */
const toNumber = (text: string) => (text.trim() === "" ? null : Number(text));

export function CreateOrderForm({ recipes, initialRecipeId }: { recipes: RecipeDetail[]; initialRecipeId?: string }) {
  const router = useRouter();
  const ids = { recipe: useId(), qty: useId(), roll: useId(), fabric: useId() };
  const [recipeId, setRecipeId] = useState(recipes.some((r) => r.id === initialRecipeId) ? initialRecipeId! : "");
  const [qty, setQty] = useState("");
  const [roll, setRoll] = useState("");
  const [fabric, setFabric] = useState("");
  // One key per logical submission: retries/double-clicks reuse it so the server never creates duplicates.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  /** Updates a field and clears its (now stale) error message. */
  const edit = (field: string, set: (value: string) => void) => (value: string) => {
    set(value);
    setErrors((prev) => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const recipe = recipes.find((r) => r.id === recipeId);
  const qtyNumber = toNumber(qty);
  const fabricNumber = toNumber(fabric);

  // Preview only — the server recomputes expected counts from the database recipe on submit.
  const preview = useMemo(() => {
    if (!recipe || !isValidTargetQty(qtyNumber)) return null;
    const components = expectedComponentQuantities(qtyNumber, recipe.components);
    const wastage =
      fabricNumber !== null && Number.isFinite(fabricNumber) && fabricNumber >= 0
        ? calculateWastage({ targetQty: qtyNumber, stdFabricYards: recipe.stdFabricYards, actualFabricYds: fabricNumber, wastageCapPct: recipe.wastageCap })
        : null;
    const { expectedFabricYds } = calculateWastage({ targetQty: qtyNumber, stdFabricYards: recipe.stdFabricYards, actualFabricYds: 0, wastageCapPct: recipe.wastageCap });
    return { components, wastage, expectedFabric: expectedFabricYds };
  }, [recipe, qtyNumber, fabricNumber]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const parsed = createOrderSchema.safeParse({
      recipeId,
      targetQty: qtyNumber ?? undefined,
      fabricRollId: roll,
      actualFabricYds: fabricNumber ?? undefined,
      idempotencyKey,
    });
    if (!parsed.success) {
      setErrors(firstIssuePerField(parsed.error.issues));
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const { order } = await apiFetch<CreateResponse>("/api/orders", { method: "POST", body: parsed.data });
      router.push(`/orders/${order.id}?created=1`);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrors(err.fieldErrors());
        setFormError(err.message);
        if (err.status === 409) setIdempotencyKey(crypto.randomUUID());
      } else {
        setFormError("Could not create the order. Please try again.");
      }
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <Card>
        <CardHeader title="Batch details" />
        <CardBody className="space-y-4">
          {formError && <Alert tone="error">{formError}</Alert>}
          <Field id={ids.recipe} label="Recipe" required error={errors.recipeId}>
            <Select
              id={ids.recipe}
              value={recipeId}
              onChange={(e) => edit("recipeId", setRecipeId)(e.target.value)}
              invalid={!!errors.recipeId}
              aria-describedby={describedBy(ids.recipe, errors.recipeId)}
              required
            >
              <option value="">Select a recipe…</option>
              {recipes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.recipeCode} — {r.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field id={ids.qty} label="Target batch quantity (garments)" required error={errors.targetQty} hint="Whole number, 1 – 100,000.">
            <Input
              id={ids.qty}
              inputMode="numeric"
              autoComplete="off"
              placeholder="e.g. 50"
              value={qty}
              onChange={(e) => edit("targetQty", setQty)(e.target.value)}
              invalid={!!errors.targetQty}
              aria-describedby={describedBy(ids.qty, errors.targetQty, true)}
              required
            />
          </Field>
          <Field id={ids.roll} label="Fabric roll ID" required error={errors.fabricRollId} hint="As printed on the roll tag.">
            <Input
              id={ids.roll}
              autoComplete="off"
              placeholder="e.g. ROLL-2026-0412"
              maxLength={64}
              value={roll}
              onChange={(e) => edit("fabricRollId", setRoll)(e.target.value)}
              invalid={!!errors.fabricRollId}
              aria-describedby={describedBy(ids.roll, errors.fabricRollId, true)}
              required
            />
          </Field>
          <Field id={ids.fabric} label="Actual fabric used (yards)" required error={errors.actualFabricYds} hint="Up to 2 decimal places.">
            <Input
              id={ids.fabric}
              inputMode="decimal"
              autoComplete="off"
              placeholder="e.g. 92.50"
              value={fabric}
              onChange={(e) => edit("actualFabricYds", setFabric)(e.target.value)}
              invalid={!!errors.actualFabricYds}
              aria-describedby={describedBy(ids.fabric, errors.actualFabricYds, true)}
              required
            />
          </Field>
          <Button type="submit" loading={pending} className="w-full sm:w-auto">
            <Send aria-hidden className="size-4" /> Submit for verification
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Expected component summary" description="Live preview. Final counts are recalculated by the server from the recipe." />
        <CardBody>
          {!preview ? (
            <Alert tone="info">Select a recipe and enter a valid target quantity to preview expected component counts.</Alert>
          ) : (
            <div className="space-y-4" aria-live="polite">
              <div className="overflow-x-auto rounded-md border border-line">
                <table className="w-full text-sm">
                  <caption className="sr-only">Expected components</caption>
                  <thead className="bg-neutral-bg text-left text-ink">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-semibold">Component</th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">Expected pieces</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {preview.components.map((c) => (
                      <tr key={c.id}>
                        <td className="px-3 py-2 text-ink">
                          {c.componentName} <span className="text-ink-muted">(×{c.piecesPerGarment})</span>
                        </td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums text-ink">{formatInt(c.expectedQty)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                <div className="rounded-md border border-line p-3">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Standard fabric</dt>
                  <dd className="mt-1 font-semibold tabular-nums text-ink">{formatYards(preview.expectedFabric)}</dd>
                </div>
                <div className="rounded-md border border-line p-3">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Fabric variance</dt>
                  <dd className="mt-1 font-semibold tabular-nums text-ink">{preview.wastage ? formatPct(preview.wastage.wastagePct) : "—"}</dd>
                </div>
                <div className="rounded-md border border-line p-3">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Wastage cap</dt>
                  <dd className="mt-1 font-semibold tabular-nums text-ink">{recipe && formatPct(recipe.wastageCap, { signed: false })}</dd>
                </div>
              </dl>
              {preview.wastage?.exceedsCap && (
                <Alert tone="warning" title="Fabric wastage exceeds the recipe cap">
                  This is recorded for review; it does not block verification.
                </Alert>
              )}
              <p className="flex items-start gap-2 text-sm text-ink-muted">
                <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>
                  After submission the order enters <strong className="text-ink">Pending verification</strong>. It can reach the Sewing
                  Queue only after a Cutting Verifier counts every component and approves it.
                </span>
              </p>
            </div>
          )}
        </CardBody>
      </Card>
    </form>
  );
}
