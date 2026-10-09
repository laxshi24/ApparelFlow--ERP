import { ShieldX } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { ROLE_HOME, ROLE_LABELS } from "@/lib/auth/permissions";
import type { UserRole } from "@/lib/database/schema";

export function AccessDenied({ role, what }: { role: UserRole; what: string }) {
  return (
    <div role="alert" className="mx-auto mt-10 max-w-lg rounded-lg border border-bad-line bg-surface p-6 text-center shadow-sm">
      <ShieldX aria-hidden className="mx-auto size-10 text-bad" />
      <h1 className="mt-3 text-xl font-bold text-ink">Access denied (403)</h1>
      <p className="mt-2 text-sm text-ink">
        The <strong>{ROLE_LABELS[role]}</strong> role is not permitted to {what}.
      </p>
      <LinkButton href={ROLE_HOME[role]} className="mt-5" variant="secondary">
        Go to my dashboard
      </LinkButton>
    </div>
  );
}
