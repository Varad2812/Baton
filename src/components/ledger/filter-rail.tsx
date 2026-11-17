import Link from "next/link";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type FacetGroup = {
  key: string;
  label: string;
  options: { value: string; label: React.ReactNode; count: number }[];
};

export function FilterRail({
  basePath,
  params,
  groups,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  groups: FacetGroup[];
}) {
  const href = (key: string, value: string | null) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "claim") next.set(k, v);
    if (value === null || params[key] === value) next.delete(key);
    else next.set(key, value);
    const qs = next.toString();
    return `${basePath}${qs ? `?${qs}` : ""}`;
  };
  const active = groups.filter((g) => params[g.key]).length + (params.q ? 1 : 0);
  return (
    <aside className="space-y-4" aria-label="Filters">
      <form action={basePath} className="relative">
        {Object.entries(params).map(([k, v]) =>
          v && k !== "q" && k !== "claim" ? <input key={k} type="hidden" name={k} value={v} /> : null,
        )}
        <input
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Filter by text"
          aria-label="Filter facts by text"
          className="h-8 w-full rounded-md border border-border bg-bg px-2.5 text-[13px] text-text outline-none placeholder:text-subtle focus:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/30"
        />
      </form>
      {active > 0 && (
        <Link href={basePath} className="inline-flex items-center gap-1 text-xs text-muted hover:text-text">
          <X className="size-3" /> Clear {active} filter{active > 1 ? "s" : ""}
        </Link>
      )}
      {groups.map((g) => (
        <div key={g.key}>
          <h3 className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wide text-subtle">{g.label}</h3>
          <ul className="space-y-px">
            {g.options.map((o) => {
              const on = params[g.key] === o.value;
              return (
                <li key={o.value}>
                  <Link
                    href={href(g.key, o.value)}
                    scroll={false}
                    aria-current={on ? "true" : undefined}
                    className={cn(
                      "flex h-7 items-center gap-2 rounded-md px-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      on ? "bg-surface-2 text-text" : "text-muted hover:bg-surface-2/60 hover:text-text",
                      o.count === 0 && !on && "text-subtle",
                    )}
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-2 truncate">{o.label}</span>
                    <span className="font-mono text-[11px] text-subtle">{o.count}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </aside>
  );
}
