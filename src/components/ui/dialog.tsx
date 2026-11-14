"use client";

import { Dialog as D } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Dialog({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  footer,
  className,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactElement;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange ? (o) => onOpenChange(o) : undefined}>
      {trigger && <D.Trigger render={trigger} />}
      <D.Portal>
        <D.Backdrop className="fixed inset-0 z-[60] bg-black/60 transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <D.Popup
          className={cn(
            "fixed left-1/2 top-[14vh] z-[61] w-[min(560px,calc(100vw-32px))] -translate-x-1/2 rounded-lg border border-border bg-surface shadow-2xl shadow-black/50 outline-none transition-all duration-200 data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0",
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-3.5">
            <div>
              <D.Title className="text-sm font-semibold text-text">{title}</D.Title>
              {description && <D.Description className="mt-0.5 text-xs text-muted">{description}</D.Description>}
            </div>
            <D.Close aria-label="Close" className="rounded p-1 text-subtle hover:bg-surface-2 hover:text-text focus-visible:ring-2 focus-visible:ring-primary outline-none">
              <X className="size-4" />
            </D.Close>
          </div>
          {children && <div className="max-h-[60vh] overflow-y-auto px-5 py-4">{children}</div>}
          {footer && <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
        </D.Popup>
      </D.Portal>
    </D.Root>
  );
}

export const DialogClose = D.Close;
