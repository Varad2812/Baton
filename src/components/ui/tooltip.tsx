"use client";

import { Tooltip as T } from "@base-ui/react/tooltip";
import { cn } from "@/lib/utils";

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return (
    <T.Provider delay={250} closeDelay={50}>
      {children}
    </T.Provider>
  );
}

/** Wraps any inline content; the trigger renders as a span so it never nests buttons. */
export function Tooltip({
  content,
  children,
  side = "top",
  className,
  asButton = false,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
  asButton?: boolean;
}) {
  return (
    <T.Root>
      <T.Trigger
        render={asButton ? undefined : <span tabIndex={0} />}
        className={cn("inline-flex cursor-default outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm", className)}
      >
        {children}
      </T.Trigger>
      <T.Portal>
        <T.Positioner side={side} sideOffset={6} className="z-[70]">
          <T.Popup className="max-w-xs rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-xs leading-relaxed text-text shadow-lg shadow-black/40 transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0">
            {content}
          </T.Popup>
        </T.Positioner>
      </T.Portal>
    </T.Root>
  );
}
