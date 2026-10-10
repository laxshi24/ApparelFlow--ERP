"use client";

import { Hammer } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@frontend/components/ui/button";
import { Dialog } from "@frontend/components/ui/dialog";
import { Alert } from "@frontend/components/ui/feedback";
import { ApiClientError, apiFetch } from "@frontend/lib/api-client";

export function StartAssemblyButton({ orderId, orderNo, size }: { orderId: string; orderNo: string; size?: "sm" | "md" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setPending(true);
    setError(null);
    try {
      await apiFetch(`/api/sewing/${orderId}/start`, { method: "POST" });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not start assembly. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button size={size} onClick={() => setOpen(true)} aria-label={`Start sewing assembly for ${orderNo}`}>
        <Hammer aria-hidden className="size-4" /> Start assembly
      </Button>
      <Dialog
        open={open}
        onClose={() => !pending && setOpen(false)}
        tone="success"
        title={`Start sewing assembly for ${orderNo}?`}
        description="The start time and your name are recorded. The batch's verification record is not changed."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={() => void start()} loading={pending}>
              <Hammer aria-hidden className="size-4" /> Confirm start
            </Button>
          </>
        }
      >
        {error && <Alert tone="error">{error}</Alert>}
      </Dialog>
    </>
  );
}
