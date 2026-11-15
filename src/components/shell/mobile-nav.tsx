"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

/** Desktop: the sidebar as is. Below md: hidden behind a menu button that opens it as an overlay. */
export function MobileNav({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  return (
    <>
      <div className="hidden md:block">{children}</div>
      <button
        data-shell="menu"
        aria-label="Open menu"
        onClick={() => setOpen(true)}
        className="fixed left-2 top-2 z-[45] flex size-8 items-center justify-center rounded-md border border-border bg-surface text-muted outline-none focus-visible:ring-2 focus-visible:ring-primary md:hidden"
      >
        <Menu className="size-4" />
      </button>
      {open && (
        <div className="fixed inset-0 z-[60] md:hidden" data-shell="menu-overlay">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="relative h-full w-[232px]">
            {children}
            <button aria-label="Close menu" onClick={() => setOpen(false)} className="absolute -right-10 top-2 flex size-8 items-center justify-center rounded-md bg-surface text-muted">
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
