"use client";

import { LogOut } from "lucide-react";
import { useFormStatus } from "react-dom";
import { logoutAction } from "@/features/authentication/server/auth.actions";

function SignOutButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-slate-400 px-3 text-sm font-semibold text-white hover:bg-slate-700 focus-visible:outline-white disabled:opacity-60"
    >
      <LogOut aria-hidden className="size-4" />
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}

/** Sign-out via a Server Action form (also works without JavaScript). */
export function SessionControls() {
  return (
    <form action={logoutAction}>
      <SignOutButton />
    </form>
  );
}
