"use client";

import { Popover } from "@base-ui/react/popover";
import { ChevronDown, Share2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

/** One "Share & export" button on the handover; the receipt, downloads and share link live inside. */
export function ShareMenu({ children }: { children: React.ReactNode }) {
  return (
    <Popover.Root>
      <Popover.Trigger data-share-menu data-print-hide className={buttonVariants({ variant: "outline", size: "sm" })}>
        <Share2 className="size-3.5" />
        Share &amp; export
        <ChevronDown className="size-3.5 text-subtle" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} align="end" className="z-[70]">
          <Popover.Popup className="flex w-[240px] flex-col gap-1.5 rounded-lg border border-border bg-surface-2 p-2 shadow-xl shadow-black/50 outline-none [&>*]:w-full [&>*]:justify-start">
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
