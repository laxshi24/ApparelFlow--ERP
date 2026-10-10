"use client";

import { RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@frontend/components/ui/button";
import { Dialog } from "@frontend/components/ui/dialog";
import { Alert } from "@frontend/components/ui/feedback";
import { describedBy, Field, Input, Textarea } from "@frontend/components/ui/form";
import { ApiClientError, apiFetch } from "@frontend/lib/api-client";
import { firstIssuePerField } from "@shared/validation/helpers";
import { recutSchema, type RecutInput } from "@shared/validation/recut.schema";

/** Supervisor's explicit, audited re-cut of a REJECTED batch: opens a new verification attempt. */
export function RecutForm({ orderId, orderNo, fabricRollId, actualFabricYds }: { orderId: string; orderNo: string; fabricRollId: string; actualFabricYds: number }) {
  const router = useRouter();
  const ids = { roll: useId(), fabric: useId(), note: useId() };
  const [roll, setRoll] = useState(fabricRollId);
  const [fabric, setFabric] = useState(String(actualFabricYds));
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<RecutInput | null>(null);
  const [pending, setPending] = useState(false);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const parsed = recutSchema.safeParse({
      fabricRollId: roll,
      actualFabricYds: fabric.trim() === "" ? undefined : Number(fabric),
      note,
    });
    if (!parsed.success) {
      setErrors(firstIssuePerField(parsed.error.issues));
      return;
    }
    setErrors({});
    setConfirming(parsed.data);
  }

  async function submit(input: RecutInput) {
    setPending(true);
    try {
      await apiFetch(`/api/orders/${orderId}/recut`, { method: "POST", body: input });
      setConfirming(null);
      router.refresh();
    } catch (err) {
      setConfirming(null);
      if (err instanceof ApiClientError) {
        setErrors(err.fieldErrors());
        setFormError(err.message);
      } else setFormError("Could not submit the re-cut. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {formError && <Alert tone="error">{formError}</Alert>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id={ids.roll} label="Fabric roll ID" required error={errors.fabricRollId}>
          <Input id={ids.roll} value={roll} maxLength={64} onChange={(e) => setRoll(e.target.value)} invalid={!!errors.fabricRollId} aria-describedby={describedBy(ids.roll, errors.fabricRollId)} />
        </Field>
        <Field id={ids.fabric} label="Total fabric used for the batch (yards)" required error={errors.actualFabricYds} hint="Include fabric used for the re-cut.">
          <Input id={ids.fabric} inputMode="decimal" value={fabric} onChange={(e) => setFabric(e.target.value)} invalid={!!errors.actualFabricYds} aria-describedby={describedBy(ids.fabric, errors.actualFabricYds, true)} />
        </Field>
      </div>
      <Field id={ids.note} label="What was corrected?" required error={errors.note} hint="Recorded in the audit history.">
        <Textarea id={ids.note} rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Re-cut 8 sleeve cuffs from roll R-2207" invalid={!!errors.note} aria-describedby={describedBy(ids.note, errors.note, true)} />
      </Field>
      <Button type="submit">
        <RotateCcw aria-hidden className="size-4" /> Submit re-cut for verification
      </Button>

      <Dialog
        open={confirming !== null}
        onClose={() => !pending && setConfirming(null)}
        title={`Submit re-cut for ${orderNo}?`}
        description="A new verification attempt is opened. The verifier must count every component again; the rejected attempt stays in the audit history."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(null)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={() => confirming && void submit(confirming)} loading={pending}>
              <RotateCcw aria-hidden className="size-4" /> Confirm re-cut
            </Button>
          </>
        }
      />
    </form>
  );
}
