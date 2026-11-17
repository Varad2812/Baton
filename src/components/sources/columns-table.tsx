"use client";

import { useEffect, useState } from "react";
import { Menu } from "@base-ui/react/menu";
import { Check, Columns3 } from "lucide-react";
import { DataTable, type Column, type Row } from "@/components/ui/data-table";

/** DataTable with a "Columns" menu: low-value columns start hidden and can be shown (remembered per browser). */
export function ColumnsTable({
  columns,
  rows,
  optional,
  storageKey,
  ariaLabel,
  toolbar,
}: {
  columns: Column[];
  rows: Row[];
  /** Keys of columns that can be toggled; they start hidden. */
  optional: string[];
  storageKey: string;
  ariaLabel: string;
  toolbar?: React.ReactNode;
}) {
  const [shown, setShown] = useState<string[]>([]);
  useEffect(() => {
    let saved: string[] = [];
    try {
      saved = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    } catch {}
    const id = requestAnimationFrame(() => setShown(Array.isArray(saved) ? saved.filter((k) => optional.includes(k)) : []));
    return () => cancelAnimationFrame(id);
  }, [storageKey, optional]);
  const toggle = (k: string) =>
    setShown((prev) => {
      const next = prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k];
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {}
      return next;
    });
  const visible = columns.filter((c) => !optional.includes(c.key) || shown.includes(c.key));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 text-xs text-subtle">{toolbar}</div>
        <Menu.Root>
          <Menu.Trigger
            data-columns-menu
            className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-surface px-2 text-xs text-muted outline-none hover:bg-surface-2 hover:text-text focus-visible:ring-2 focus-visible:ring-primary data-[popup-open]:bg-surface-2"
          >
            <Columns3 className="size-3.5" aria-hidden />
            Columns
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner sideOffset={6} align="end" className="z-[70]">
              <Menu.Popup className="w-[200px] rounded-lg border border-border bg-surface-2 p-1 shadow-xl shadow-black/50 outline-none">
                {columns
                  .filter((c) => optional.includes(c.key))
                  .map((c) => (
                    <Menu.CheckboxItem
                      key={c.key}
                      checked={shown.includes(c.key)}
                      onCheckedChange={() => toggle(c.key)}
                      closeOnClick={false}
                      className="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-text outline-none data-[highlighted]:bg-surface"
                    >
                      <span className="flex size-4 items-center justify-center">
                        <Menu.CheckboxItemIndicator>
                          <Check className="size-3.5 text-primary" />
                        </Menu.CheckboxItemIndicator>
                      </span>
                      {c.header}
                    </Menu.CheckboxItem>
                  ))}
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </div>
      <DataTable ariaLabel={ariaLabel} fixed minWidth={680} columns={visible} rows={rows} />
    </div>
  );
}
