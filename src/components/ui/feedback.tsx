import { AlertTriangle, CheckCircle2, Info, XOctagon, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "./cn";

type Tone = "info" | "success" | "warning" | "error";

const tones: Record<Tone, { box: string; icon: LucideIcon }> = {
  info: { box: "border-info-line bg-info-bg text-info", icon: Info },
  success: { box: "border-ok-line bg-ok-bg text-ok", icon: CheckCircle2 },
  warning: { box: "border-warn-line bg-warn-bg text-warn", icon: AlertTriangle },
  error: { box: "border-bad-line bg-bad-bg text-bad", icon: XOctagon },
};

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const { box, icon: Icon } = tones[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex gap-3 rounded-md border p-3 text-sm", box, className)}>
      <Icon aria-hidden className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0 space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-ink">{children}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
      <Icon aria-hidden className="size-10 text-ink-muted" />
      <p className="text-base font-semibold text-ink">{title}</p>
      {children && <div className="max-w-md text-sm text-ink-muted">{children}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-slate-200", className)} />;
}

export function PageSkeleton({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="space-y-4" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
