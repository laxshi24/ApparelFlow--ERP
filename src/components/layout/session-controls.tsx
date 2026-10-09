"use client";

import { LogOut, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import type { DemoAccount } from "@/features/authentication/ui/demo-credentials-panel";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { ApiClientError, apiFetch } from "@/lib/http/client";

/**
 * Logout + (in demo mode) persona switcher. Switching persona performs a real logout and
 * a real login as the seeded demo user — the role is assigned by the server, not this component.
 */
export function SessionControls({
  currentEmail,
  demo,
}: {
  currentEmail: string;
  demo: { accounts: DemoAccount[]; password: string } | null;
}) {
  const router = useRouter();
  const selectId = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function logout() {
    setPending(true);
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  async function switchTo(email: string) {
    if (!demo || email === currentEmail) return;
    setPending(true);
    setError(null);
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
      const { home } = await apiFetch<{ home: string }>("/api/auth/login", {
        method: "POST",
        body: { email, password: demo.password },
      });
      router.replace(home);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not switch persona");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {demo && (
        <div className="flex items-center gap-1.5">
          <label htmlFor={selectId} className="flex items-center gap-1 text-xs font-semibold text-slate-200">
            <Users aria-hidden className="size-4" />
            <span className="sr-only sm:not-sr-only">Persona</span>
          </label>
          <select
            id={selectId}
            value={currentEmail}
            disabled={pending}
            onChange={(e) => void switchTo(e.target.value)}
            className="min-h-9 max-w-44 rounded-md border border-slate-400 bg-white px-2 text-sm font-medium text-ink"
          >
            {demo.accounts.map((a) => (
              <option key={a.email} value={a.email}>
                {ROLE_LABELS[a.role]}
              </option>
            ))}
          </select>
        </div>
      )}
      <button
        type="button"
        onClick={() => void logout()}
        disabled={pending}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-slate-400 px-3 text-sm font-semibold text-white hover:bg-slate-700 focus-visible:outline-white disabled:opacity-60"
      >
        <LogOut aria-hidden className="size-4" />
        Sign out
      </button>
      {error && (
        <p role="alert" className="w-full text-sm font-medium text-red-200">
          {error}
        </p>
      )}
    </div>
  );
}
