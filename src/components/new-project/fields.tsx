"use client";

import { forwardRef } from "react";
import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export const inputClass =
  "h-8 w-full rounded-md border bg-bg px-2.5 text-[13px] text-text outline-none transition-colors duration-150 placeholder:text-subtle focus:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-50";

export function Field({
  id,
  label,
  hint,
  error,
  aside,
  children,
  className,
}: {
  id: string;
  label: string;
  hint?: React.ReactNode;
  error?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-xs font-medium text-muted">
          {label}
        </label>
        {aside && <span className="font-mono text-[11px] text-subtle">{aside}</span>}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1 flex items-center gap-1 text-xs text-conflicting">
          <CircleAlert className="size-3 shrink-0" />
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const TextInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; mono?: boolean }>(
  function TextInput({ invalid, mono, className, id, ...props }, ref) {
    return (
      <input
        ref={ref}
        id={id}
        aria-invalid={invalid || undefined}
        aria-describedby={id ? (invalid ? `${id}-error` : `${id}-hint`) : undefined}
        className={cn(inputClass, invalid ? "border-conflicting/60" : "border-border", mono && "font-mono text-[12px]", className)}
        {...props}
      />
    );
  },
);
