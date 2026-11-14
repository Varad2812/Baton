"use client";

import { cn } from "@/lib/utils";

export function SegmentedControl<V extends string>({
  options,
  value,
  onChange,
  className,
  size = "md",
  ariaLabel,
}: {
  options: { value: V; label: React.ReactNode; count?: number }[];
  value: V;
  onChange: (v: V) => void;
  className?: string;
  size?: "sm" | "md";
  ariaLabel?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("inline-flex items-center rounded-md border border-border bg-bg p-0.5", className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[5px] font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary",
              size === "sm" ? "h-6 px-2 text-xs" : "h-7 px-2.5 text-[13px]",
              active ? "bg-surface-2 text-text shadow-[inset_0_0_0_1px_var(--border)]" : "text-muted hover:text-text",
            )}
          >
            {o.label}
            {o.count !== undefined && <span className="font-mono text-[11px] text-subtle">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
