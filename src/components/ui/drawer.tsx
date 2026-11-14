"use client";

import { Dialog as D } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Right-hand sheet. Controlled; content is usually server-rendered and passed as children. */
export function Drawer({
  open,
  onOpenChange,
  title,
  subtitle,
  actions,
  children,
  footer,
  width = 600,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
  className?: string;
}) {
  return (
    <D.Root open={open} onOpenChange={(o) => onOpenChange(o)}>
      <D.Portal>
        <D.Backdrop className="fixed inset-0 z-[50] bg-black/40 transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <D.Popup
          className={cn(
            "fixed inset-y-0 right-0 z-[51] flex max-w-[calc(100vw-48px)] flex-col border-l border-border bg-surface shadow-2xl shadow-black/60 outline-none transition-transform duration-200 ease-out data-[ending-style]:translate-x-full data-[starting-style]:translate-x-full",
            className,
          )}
          style={{ width }}
        >
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-3.5">
            <div className="min-w-0">
              <D.Title className="text-[15px] font-semibold leading-snug text-text">{title}</D.Title>
              {subtitle && <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">{subtitle}</div>}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {actions}
              <D.Close aria-label="Close drawer" className="rounded p-1 text-subtle outline-none hover:bg-surface-2 hover:text-text focus-visible:ring-2 focus-visible:ring-primary">
                <X className="size-4" />
              </D.Close>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">{footer}</div>}
        </D.Popup>
      </D.Portal>
    </D.Root>
  );
}
