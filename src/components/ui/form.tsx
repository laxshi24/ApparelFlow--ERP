import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

const controlBase =
  "block w-full rounded-md border bg-surface px-3 text-base text-ink shadow-sm sm:text-sm " +
  "disabled:cursor-not-allowed disabled:bg-neutral-bg disabled:text-ink-muted";

function controlClasses(invalid: boolean, extra?: string) {
  return cn(controlBase, invalid ? "border-bad ring-1 ring-bad" : "border-line-strong", extra);
}

type FieldProps = {
  id: string;
  label: ReactNode;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
};

/** Label + control + hint + error, wired together with ids for screen readers. */
export function Field({ id, label, error, hint, required, children, className }: FieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-semibold text-ink">
        {label}
        {required && (
          <span className="ml-0.5 text-bad" aria-hidden>
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-sm text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm font-medium text-bad">
          {error}
        </p>
      )}
    </div>
  );
}

export function describedBy(id: string, error?: string, hint?: ReactNode) {
  return error ? `${id}-error` : hint ? `${id}-hint` : undefined;
}

type InputProps = ComponentProps<"input"> & { invalid?: boolean };

export function Input({ invalid = false, className, ...rest }: InputProps) {
  return <input aria-invalid={invalid || undefined} className={controlClasses(invalid, cn("min-h-11 py-2", className))} {...rest} />;
}

type SelectProps = ComponentProps<"select"> & { invalid?: boolean };

export function Select({ invalid = false, className, children, ...rest }: SelectProps) {
  return (
    <select aria-invalid={invalid || undefined} className={controlClasses(invalid, cn("min-h-11 py-2 pr-8", className))} {...rest}>
      {children}
    </select>
  );
}

type TextareaProps = ComponentProps<"textarea"> & { invalid?: boolean };

export function Textarea({ invalid = false, className, ...rest }: TextareaProps) {
  return <textarea aria-invalid={invalid || undefined} className={controlClasses(invalid, cn("py-2", className))} {...rest} />;
}
