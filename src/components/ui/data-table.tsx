"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type Column = {
  key: string;
  header: React.ReactNode;
  align?: "left" | "right" | "center";
  width?: string;
  sortable?: boolean;
  className?: string;
};

export type Row = {
  id: string;
  cells: Record<string, React.ReactNode>;
  sort?: Record<string, string | number | null>;
  href?: string;
  selected?: boolean;
  className?: string;
};

/** Compact, sortable table with a sticky header. Cells may be server-rendered nodes. */
export function DataTable({
  columns,
  rows,
  defaultSort,
  maxHeight,
  className,
  footer,
  empty,
  ariaLabel,
  fixed = false,
}: {
  columns: Column[];
  rows: Row[];
  defaultSort?: { key: string; dir: "asc" | "desc" };
  maxHeight?: number | string;
  className?: string;
  footer?: React.ReactNode;
  empty?: React.ReactNode;
  ariaLabel?: string;
  fixed?: boolean;
}) {
  const router = useRouter();
  const [sort, setSort] = useState(defaultSort ?? null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = a.sort?.[sort.key] ?? null;
      const bv = b.sort?.[sort.key] ?? null;
      if (av === bv) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return av < bv ? -dir : dir;
    });
  }, [rows, sort]);

  const toggle = (key: string) =>
    setSort((s) => (s?.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));

  return (
    <div className={cn("overflow-auto rounded-lg border border-border bg-surface", className)} style={{ maxHeight }}>
      <table className={cn("w-full border-collapse text-[13px]", fixed && "table-fixed")} aria-label={ariaLabel}>
        <thead className="sticky top-0 z-10 bg-surface">
          <tr className="shadow-[inset_0_-1px_0_var(--border)]">
            {columns.map((c) => {
              const active = sort?.key === c.key;
              return (
                <th
                  key={c.key}
                  scope="col"
                  style={{ width: c.width }}
                  aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                  className={cn(
                    "h-8 whitespace-nowrap px-3 text-[11px] font-medium uppercase tracking-wide text-subtle",
                    c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left",
                  )}
                >
                  {c.sortable ? (
                    <button
                      type="button"
                      onClick={() => toggle(c.key)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-sm uppercase outline-none hover:text-text focus-visible:ring-2 focus-visible:ring-primary",
                        active && "text-text",
                      )}
                    >
                      {c.header}
                      {active ? (
                        sort!.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
                      ) : (
                        <ChevronsUpDown className="size-3 opacity-50" />
                      )}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr
              key={r.id}
              onClick={r.href ? () => router.push(r.href!, { scroll: false }) : undefined}
              onKeyDown={r.href ? (e) => e.key === "Enter" && router.push(r.href!, { scroll: false }) : undefined}
              tabIndex={r.href ? 0 : undefined}
              aria-selected={r.selected || undefined}
              className={cn(
                "border-b border-border/70 last:border-b-0 outline-none",
                r.href && "cursor-pointer hover:bg-surface-2/70 focus-visible:bg-surface-2 focus-visible:shadow-[inset_2px_0_0_var(--primary)]",
                r.selected && "bg-surface-2 shadow-[inset_2px_0_0_var(--primary)]",
                r.className,
              )}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    "h-9 px-3 py-1.5 align-middle",
                    c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left",
                    c.className,
                  )}
                >
                  {r.cells[c.key]}
                </td>
              ))}
            </tr>
          ))}
          {sorted.length === 0 && empty && (
            <tr>
              <td colSpan={columns.length} className="p-4">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {footer}
    </div>
  );
}
