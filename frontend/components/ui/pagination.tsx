import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@frontend/components/ui/cn";

/** Server-rendered pagination using query-string links (works without JavaScript). */
export function Pagination({
  page,
  pageSize,
  total,
  hrefForPage,
  noun = "items",
}: {
  page: number;
  pageSize: number;
  total: number;
  hrefForPage: (page: number) => string;
  noun?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const linkClasses = "inline-flex min-h-10 items-center gap-1 rounded-md border border-line-strong bg-surface px-3 text-sm font-semibold text-ink hover:bg-neutral-bg";
  const disabled = "pointer-events-none opacity-50";
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-ink-muted">
        Page <strong className="text-ink">{page}</strong> of <strong className="text-ink">{pages}</strong> · {total} {noun}
      </p>
      <div className="flex gap-2">
        <Link href={hrefForPage(page - 1)} aria-disabled={page <= 1} tabIndex={page <= 1 ? -1 : undefined} className={cn(linkClasses, page <= 1 && disabled)}>
          <ChevronLeft aria-hidden className="size-4" /> Previous
        </Link>
        <Link href={hrefForPage(page + 1)} aria-disabled={page >= pages} tabIndex={page >= pages ? -1 : undefined} className={cn(linkClasses, page >= pages && disabled)}>
          Next <ChevronRight aria-hidden className="size-4" />
        </Link>
      </div>
    </nav>
  );
}
