"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@frontend/components/ui/cn";

/**
 * Modal built on the native <dialog> element: focus is trapped and restored by the browser,
 * Escape closes it, and the backdrop is inert. Content is unmounted while closed.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  tone = "default",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer: ReactNode;
  tone?: "default" | "danger" | "success";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-lg border border-line bg-surface p-0 text-ink shadow-xl"
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <div
            className={cn(
              "flex items-start justify-between gap-4 border-b px-5 py-4",
              tone === "danger" ? "border-bad-line" : tone === "success" ? "border-ok-line" : "border-line",
            )}
          >
            <div>
              <h2 id={titleId} className="text-lg font-bold text-ink">
                {title}
              </h2>
              {description && (
                <p id={descId} className="mt-1 text-sm text-ink-muted">
                  {description}
                </p>
              )}
            </div>
            <button type="button" onClick={onClose} aria-label="Close dialog" className="rounded-md p-1 text-ink hover:bg-neutral-bg">
              <X aria-hidden className="size-5" />
            </button>
          </div>
          {children && <div className="overflow-y-auto px-5 py-4">{children}</div>}
          <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4">{footer}</div>
        </div>
      )}
    </dialog>
  );
}
