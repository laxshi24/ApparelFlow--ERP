"use client";

import { KeyRound, LogIn } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import type { UserRole } from "@/lib/database/schema";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { useLogin } from "./login-form";

export type DemoAccount = { email: string; fullName: string; role: UserRole };

const ROLE_SUMMARY: Record<UserRole, string> = {
  cutting_supervisor: "Creates cutting orders, reviews rejections and submits re-cuts.",
  cutting_verifier: "Counts components and approves or rejects batches.",
  sewing_supervisor: "Sees verified batches only and starts sewing assembly.",
};

/**
 * Evaluator panel: each button performs a real sign-in through /api/auth/login with the
 * seeded demo account — it does not switch a client-side role.
 */
export function DemoCredentialsPanel({ accounts, password, next }: { accounts: DemoAccount[]; password: string; next: string | null }) {
  const { submit, pending, error } = useLogin(next);
  const [active, setActive] = useState<string | null>(null);

  return (
    <section aria-labelledby="demo-heading" className="rounded-lg border border-info-line bg-info-bg p-4 sm:p-5">
      <h2 id="demo-heading" className="flex items-center gap-2 text-base font-semibold text-ink">
        <KeyRound aria-hidden className="size-5 text-info" />
        Demo accounts for evaluators
      </h2>
      <p className="mt-1 text-sm text-ink">
        All three accounts share the password <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-ink">{password}</code>
      </p>
      {error && (
        <Alert tone="error" className="mt-3">
          {error}
        </Alert>
      )}
      <ul className="mt-4 space-y-3">
        {accounts.map((account) => (
          <li key={account.email} className="flex flex-col gap-3 rounded-md border border-line bg-surface p-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">{ROLE_LABELS[account.role]}</p>
              <p className="break-all font-mono text-sm text-ink">{account.email}</p>
              <p className="text-sm text-ink-muted">{ROLE_SUMMARY[account.role]}</p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              loading={pending && active === account.email}
              disabled={pending}
              onClick={() => {
                setActive(account.email);
                void submit(account.email, password);
              }}
              aria-label={`Sign in as ${ROLE_LABELS[account.role]} (${account.email})`}
            >
              <LogIn aria-hidden className="size-4" />
              Sign in
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
