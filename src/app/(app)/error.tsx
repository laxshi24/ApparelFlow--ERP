"use client";

import { AlertOctagon, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Route-level error boundary: shows a recoverable message, never stack traces or SQL. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto mt-10 max-w-lg rounded-lg border border-bad-line bg-surface p-6 text-center shadow-sm">
      <AlertOctagon aria-hidden className="mx-auto size-10 text-bad" />
      <h1 className="mt-3 text-xl font-bold text-ink">Something went wrong</h1>
      <p className="mt-2 text-sm text-ink">
        The page could not be loaded. No changes were lost — data is only saved once the server confirms it.
      </p>
      {error.digest && <p className="mt-2 font-mono text-xs text-ink-muted">Reference: {error.digest}</p>}
      <Button className="mt-5" variant="secondary" onClick={reset}>
        <RotateCcw aria-hidden className="size-4" /> Try again
      </Button>
    </div>
  );
}
