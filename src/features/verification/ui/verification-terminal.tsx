"use client";

import { CheckCircle2, Loader2, Save, ShieldCheck, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { TRAFFIC_LIGHT, TrafficLightBadge } from "@/components/status/status-badges";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { Field, Textarea } from "@/components/ui/form";
import { classifyCount, type TrafficLight } from "@/domain/traffic-light";
import { formatInt, formatPct } from "@/lib/format";
import { ApiClientError, apiFetch } from "@/lib/http/client";
import type { OrderItem } from "@/features/cutting-orders/server/order-queries";
import { MAX_COUNT, REJECTION_REASON_MAX, REJECTION_REASON_MIN } from "../schemas/verification.schema";

type Parsed = { kind: "empty" } | { kind: "invalid"; message: string } | { kind: "value"; value: number };

/** Strict parsing of a typed count: digits only. "", "-1", "2.5", "1e3", "12abc" are never coerced. */
function parseCount(text: string): Parsed {
  const t = text.trim();
  if (t === "") return { kind: "empty" };
  if (!/^\d+$/.test(t)) return { kind: "invalid", message: "Enter a whole number of pieces (0 or more)" };
  const value = Number(t);
  if (value > MAX_COUNT) return { kind: "invalid", message: "Count is unrealistically large" };
  return { kind: "value", value };
}

const toQty = (p: Parsed) => (p.kind === "value" ? p.value : null);

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved"; at: Date } | { kind: "error"; message: string };

type DecisionError = { message: string; details?: { missing?: string[]; shortages?: { componentName: string; shortBy: number }[] } };

export function VerificationTerminal({
  orderId,
  orderNo,
  items,
  wastage,
}: {
  orderId: string;
  orderNo: string;
  items: OrderItem[];
  wastage: { pct: number; cap: number; exceeds: boolean };
}) {
  const router = useRouter();
  const reasonId = useId();
  const [entries, setEntries] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((i) => [i.id, i.actualQty === null ? "" : String(i.actualQty)])),
  );
  const [saved, setSaved] = useState<Record<string, number | null>>(() => Object.fromEntries(items.map((i) => [i.id, i.actualQty])));
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const [dialog, setDialog] = useState<"approve" | "reject" | null>(null);
  const [reason, setReason] = useState("");
  const [reasonTouched, setReasonTouched] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const [decisionError, setDecisionError] = useState<DecisionError | null>(null);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const rows = useMemo(
    () =>
      items.map((item) => {
        const parsed = parseCount(entries[item.id] ?? "");
        const qty = toQty(parsed);
        const light: TrafficLight | null = parsed.kind === "invalid" ? null : classifyCount(item.expectedQty, qty);
        return { item, parsed, qty, light };
      }),
    [items, entries],
  );

  const summary = useMemo(() => {
    const s = { GREEN: 0, YELLOW: 0, RED: 0, UNCOUNTED: 0, INVALID: 0 };
    for (const r of rows) {
      if (r.parsed.kind === "invalid") s.INVALID++;
      else if (r.light === null) s.UNCOUNTED++;
      else s[r.light]++;
    }
    return s;
  }, [rows]);

  const canApprove = summary.INVALID === 0 && summary.UNCOUNTED === 0 && summary.RED === 0;
  const dirty = rows.filter((r) => r.parsed.kind !== "invalid" && r.qty !== saved[r.item.id]);
  // Stable key for the pending payload: re-renders (e.g. save status changes) must not restart or abort a save.
  const dirtyKey = JSON.stringify(dirty.map((r) => ({ itemId: r.item.id, actualQty: r.qty })));

  /** Entries that are valid (counted or deliberately empty) — invalid text is never sent. */
  const validCounts = useCallback(
    () => rows.filter((r) => r.parsed.kind !== "invalid").map((r) => ({ itemId: r.item.id, actualQty: r.qty })),
    [rows],
  );

  // Debounced autosave of changed, valid entries so counts survive refreshes and device switches.
  useEffect(() => {
    const payload = JSON.parse(dirtyKey) as { itemId: string; actualQty: number | null }[];
    if (payload.length === 0 || deciding) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSaveState({ kind: "saving" });
      try {
        await apiFetch("/api/verification/" + orderId + "/counts", { method: "PUT", body: { counts: payload }, signal: controller.signal });
        setSaved((prev) => ({ ...prev, ...Object.fromEntries(payload.map((p) => [p.itemId, p.actualQty])) }));
        setSaveState({ kind: "saved", at: new Date() });
      } catch (err) {
        if (controller.signal.aborted) return;
        setSaveState({ kind: "error", message: err instanceof ApiClientError ? err.message : "Could not save counts" });
      }
    }, 700);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [dirtyKey, orderId, deciding]);

  useEffect(() => {
    if (dirty.length === 0) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty.length]);

  async function decide(kind: "approve" | "reject") {
    setDeciding(true);
    setDecisionError(null);
    try {
      const body = kind === "approve" ? { counts: validCounts() } : { reason: reason.trim(), counts: validCounts() };
      await apiFetch(`/api/verification/${orderId}/${kind}`, { method: "POST", body });
      setSaved(Object.fromEntries(rows.map((r) => [r.item.id, r.qty])));
      router.push(`/verification?decided=${kind === "approve" ? "approved" : "rejected"}&order=${encodeURIComponent(orderNo)}`);
      router.refresh();
    } catch (err) {
      setDialog(null);
      setDeciding(false);
      if (err instanceof ApiClientError) {
        setDecisionError({ message: err.message, details: err.details as DecisionError["details"] });
        if (err.status === 422) router.refresh();
      } else {
        setDecisionError({ message: "The decision could not be recorded. Please try again." });
      }
    }
  }

  const reasonError =
    reason.trim().length < REJECTION_REASON_MIN
      ? `A rejection reason of at least ${REJECTION_REASON_MIN} characters is required`
      : reason.trim().length > REJECTION_REASON_MAX
        ? `Keep the reason under ${REJECTION_REASON_MAX} characters`
        : null;

  return (
    <div className="space-y-5">
      {decisionError && (
        <Alert tone="error" title={decisionError.message}>
          {decisionError.details?.missing && decisionError.details.missing.length > 0 && <p>Not counted: {decisionError.details.missing.join(", ")}</p>}
          {decisionError.details?.shortages?.map((s) => (
            <p key={s.componentName}>
              {s.componentName}: short by {formatInt(s.shortBy)}
            </p>
          ))}
        </Alert>
      )}

      <div className="overflow-x-auto rounded-md border border-line">
        <table className="w-full min-w-[44rem] text-sm">
          <caption className="sr-only">Physical component counts for {orderNo}</caption>
          <thead className="bg-neutral-bg text-left text-ink">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold">Component</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Expected</th>
              <th scope="col" className="w-44 px-3 py-2 font-semibold">Actual count</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Variance</th>
              <th scope="col" className="px-3 py-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r, index) => {
              const inputId = `count-${r.item.id}`;
              const errorId = `${inputId}-error`;
              const variance = r.qty === null ? null : r.qty - r.item.expectedQty;
              return (
                <tr key={r.item.id} className={cn(r.light === "RED" && "bg-bad-bg", r.light === "YELLOW" && "bg-warn-bg")}>
                  <th scope="row" className="px-3 py-2 text-left font-medium text-ink">
                    <label htmlFor={inputId}>{r.item.componentName}</label>
                    <span className="block text-xs font-normal text-ink-muted">×{r.item.piecesPerGarment} per garment</span>
                  </th>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-ink">{formatInt(r.item.expectedQty)}</td>
                  <td className="px-3 py-2 align-top">
                    <input
                      ref={(el) => {
                        inputs.current[index] = el;
                      }}
                      id={inputId}
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="Count"
                      value={entries[r.item.id] ?? ""}
                      onChange={(e) => setEntries((prev) => ({ ...prev, [r.item.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          inputs.current[index + 1]?.focus();
                        }
                      }}
                      aria-invalid={r.parsed.kind === "invalid" || undefined}
                      aria-describedby={r.parsed.kind === "invalid" ? errorId : undefined}
                      className={cn(
                        "block min-h-11 w-full rounded-md border bg-surface px-3 text-right text-base font-semibold tabular-nums text-ink shadow-sm",
                        r.parsed.kind === "invalid" ? "border-bad ring-1 ring-bad" : "border-line-strong",
                      )}
                    />
                    {r.parsed.kind === "invalid" && (
                      <p id={errorId} role="alert" className="mt-1 text-xs font-medium text-bad">
                        {r.parsed.message}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-ink">
                    {variance === null ? "—" : variance > 0 ? `+${formatInt(variance)}` : variance < 0 ? `−${formatInt(-variance)}` : "0"}
                  </td>
                  <td className="px-3 py-2" aria-live="polite">
                    <TrafficLightBadge status={r.light} size="sm" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm" aria-label="Count summary">
        {(["GREEN", "YELLOW", "RED", "UNCOUNTED"] as const).map((k) => (
          <span key={k} className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-semibold", TRAFFIC_LIGHT[k].classes)}>
            {TRAFFIC_LIGHT[k].label}: {summary[k]}
          </span>
        ))}
        {summary.INVALID > 0 && (
          <span className="inline-flex items-center rounded-full border border-bad-line bg-bad-bg px-2.5 py-1 font-semibold text-bad">Invalid: {summary.INVALID}</span>
        )}
        <span className="ml-auto inline-flex items-center gap-1.5 text-ink-muted" role="status">
          {saveState.kind === "saving" && (
            <>
              <Loader2 aria-hidden className="size-4 animate-spin" /> Saving counts…
            </>
          )}
          {saveState.kind === "saved" && dirty.length === 0 && (
            <>
              <Save aria-hidden className="size-4" /> Counts saved
            </>
          )}
          {saveState.kind === "error" && <span className="font-semibold text-bad">{saveState.message}</span>}
          {dirty.length > 0 && saveState.kind !== "saving" && saveState.kind !== "error" && "Unsaved changes"}
        </span>
      </div>

      {!canApprove && (
        <Alert tone="warning" title="Approval is blocked until every component is counted with no shortage">
          <ul className="list-disc space-y-0.5 pl-5">
            {summary.UNCOUNTED > 0 && <li>{summary.UNCOUNTED} component(s) not yet counted — uncounted is never treated as zero.</li>}
            {summary.RED > 0 && <li>{summary.RED} component(s) short (RED). Short batches must be rejected for re-cutting.</li>}
            {summary.INVALID > 0 && <li>{summary.INVALID} entry(ies) are not valid whole numbers.</li>}
          </ul>
        </Alert>
      )}

      <div className="flex flex-wrap justify-end gap-3 border-t border-line pt-4">
        <Button variant="danger" onClick={() => setDialog("reject")} disabled={deciding}>
          <XCircle aria-hidden className="size-4" /> Reject batch
        </Button>
        <Button variant="success" onClick={() => setDialog("approve")} disabled={!canApprove || deciding} aria-describedby={canApprove ? undefined : "approve-blocked"}>
          <ShieldCheck aria-hidden className="size-4" /> Approve for sewing
        </Button>
        {!canApprove && (
          <span id="approve-blocked" className="sr-only">
            Approval disabled: counts are incomplete, invalid or short.
          </span>
        )}
      </div>

      <Dialog
        open={dialog === "approve"}
        onClose={() => !deciding && setDialog(null)}
        tone="success"
        title={`Approve ${orderNo}?`}
        description="This releases the batch to the Sewing Queue. The decision is recorded under your name and cannot be edited."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)} disabled={deciding}>
              Cancel
            </Button>
            <Button variant="success" onClick={() => void decide("approve")} loading={deciding}>
              <CheckCircle2 aria-hidden className="size-4" /> Confirm approval
            </Button>
          </>
        }
      >
        <ul className="space-y-1 text-sm text-ink">
          <li>
            {summary.GREEN} GREEN · {summary.YELLOW} YELLOW (surplus) · 0 RED
          </li>
          <li>
            Fabric wastage: <strong className={wastage.exceeds ? "text-warn" : undefined}>{formatPct(wastage.pct)}</strong> (cap{" "}
            {formatPct(wastage.cap, { signed: false })}){wastage.exceeds && " — exceeds cap; will be recorded"}
          </li>
        </ul>
      </Dialog>

      <Dialog
        open={dialog === "reject"}
        onClose={() => !deciding && setDialog(null)}
        tone="danger"
        title={`Reject ${orderNo}?`}
        description="The batch returns to the Cutting Supervisor for correction or re-cutting. It cannot enter the Sewing Queue."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)} disabled={deciding}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setReasonTouched(true);
                if (!reasonError) void decide("reject");
              }}
              loading={deciding}
            >
              <XCircle aria-hidden className="size-4" /> Confirm rejection
            </Button>
          </>
        }
      >
        <Field id={reasonId} label="Rejection reason" required error={reasonTouched ? (reasonError ?? undefined) : undefined} hint="Visible to the Cutting Supervisor and kept in the audit log.">
          <Textarea
            id={reasonId}
            rows={4}
            maxLength={REJECTION_REASON_MAX + 50}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onBlur={() => setReasonTouched(true)}
            placeholder="e.g. 8 sleeve cuffs missing from bundle 3"
            invalid={reasonTouched && !!reasonError}
            aria-describedby={reasonTouched && reasonError ? `${reasonId}-error` : `${reasonId}-hint`}
            required
          />
        </Field>
      </Dialog>
    </div>
  );
}
