"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { NAV } from "@/components/shell/nav";

export function Breadcrumb({ slug, projectName }: { slug: string; projectName: string }) {
  const pathname = usePathname();
  const base = `/p/${slug}`;
  const rest = pathname.slice(base.length);
  const item = NAV.find((n) => n.href !== "" && rest.startsWith(n.href)) ?? NAV[0];
  const extra = rest.startsWith("/handover/receipt") ? "Receipt" : null;
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[13px]">
      <Link href={base} className="truncate text-muted hover:text-text">
        {projectName}
      </Link>
      <ChevronRight className="size-3.5 shrink-0 text-subtle" />
      {extra ? (
        <>
          <Link href={base + item.href} className="truncate text-muted hover:text-text">
            {item.label}
          </Link>
          <ChevronRight className="size-3.5 shrink-0 text-subtle" />
          <span className="truncate font-medium text-text">{extra}</span>
        </>
      ) : (
        <span className="truncate font-medium text-text">{item.label}</span>
      )}
    </nav>
  );
}
