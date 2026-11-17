import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Tabs driven by the URL (`?tab=`), so each tab can be linked to (tour, guide, Ask Baton) and only the
 * active tab's content is rendered on the server. The first item is the default (no query).
 */
export function LinkTabs({
  path,
  current,
  items,
  label,
  className,
}: {
  path: string;
  current: string;
  items: { value: string; label: React.ReactNode; count?: number }[];
  label: string;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn("mb-4 flex items-center gap-5 overflow-x-auto border-b border-border", className)}>
      {items.map((it, i) => {
        const active = it.value === current;
        return (
          <Link
            key={it.value}
            href={i === 0 ? path : `${path}?tab=${it.value}`}
            scroll={false}
            aria-current={active ? "page" : undefined}
            data-tab={it.value}
            className={cn(
              "relative -mb-px flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary",
              active ? "border-primary font-medium text-text" : "border-transparent text-muted hover:text-text",
            )}
          >
            {it.label}
            {it.count !== undefined && <span className="rounded bg-surface-2 px-1 font-mono text-[11px] text-subtle">{it.count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

/** The active tab from search params, falling back to the first allowed value. */
export function tabFrom<T extends string>(raw: string | string[] | undefined, allowed: readonly T[]): T {
  return typeof raw === "string" && (allowed as readonly string[]).includes(raw) ? (raw as T) : allowed[0];
}
