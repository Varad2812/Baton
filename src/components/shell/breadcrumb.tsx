"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePeople } from "@/components/common/people-context";
import { ChevronRight } from "lucide-react";
import { NAV, navLabel } from "@/components/shell/nav";

export function Breadcrumb({ slug, projectName }: { slug: string; projectName: string }) {
  const pathname = usePathname();
  const people = usePeople();
  const base = `/p/${slug}`;
  const rest = pathname.slice(base.length);
  const item = NAV.find((n) => n.href !== "" && rest.startsWith(n.href)) ?? NAV[0];
  const extra = rest.startsWith("/handover/receipt") ? "Receipt" : null;
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[13px]">
      {/* The sidebar already names the project; below 2xl the top bar keeps the page name readable. */}
      <Link href={base} className="hidden truncate text-muted hover:text-text 2xl:inline">
        {projectName}
      </Link>
      <ChevronRight className="hidden size-3.5 shrink-0 text-subtle 2xl:block" />
      {extra ? (
        <>
          <Link href={base + item.href} className="truncate text-muted hover:text-text">
            {navLabel(item.label, people)}
          </Link>
          <ChevronRight className="size-3.5 shrink-0 text-subtle" />
          <span className="truncate font-medium text-text">{extra}</span>
        </>
      ) : (
        <span className="truncate font-medium text-text">{navLabel(item.label, people)}</span>
      )}
    </nav>
  );
}
