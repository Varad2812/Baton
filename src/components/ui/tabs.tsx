"use client";

import { Tabs as T } from "@base-ui/react/tabs";
import { cn } from "@/lib/utils";

export function Tabs({
  items,
  defaultValue,
  value,
  onValueChange,
  className,
  listClassName,
}: {
  items: { value: string; label: React.ReactNode; count?: number; content: React.ReactNode }[];
  defaultValue?: string;
  value?: string;
  onValueChange?: (v: string) => void;
  className?: string;
  listClassName?: string;
}) {
  return (
    <T.Root
      defaultValue={defaultValue ?? items[0]?.value}
      value={value}
      onValueChange={onValueChange ? (v) => onValueChange(String(v)) : undefined}
      className={className}
    >
      <T.List className={cn("relative flex items-center gap-4 border-b border-border", listClassName)}>
        {items.map((it) => (
          <T.Tab
            key={it.value}
            value={it.value}
            className="relative -mb-px flex h-9 items-center gap-1.5 border-b-2 border-transparent text-[13px] text-muted outline-none transition-colors hover:text-text focus-visible:text-text data-[active]:border-primary data-[active]:text-text"
          >
            {it.label}
            {it.count !== undefined && (
              <span className="rounded bg-surface-2 px-1 font-mono text-[11px] text-subtle">{it.count}</span>
            )}
          </T.Tab>
        ))}
      </T.List>
      {items.map((it) => (
        <T.Panel key={it.value} value={it.value} className="pt-4 outline-none">
          {it.content}
        </T.Panel>
      ))}
    </T.Root>
  );
}
