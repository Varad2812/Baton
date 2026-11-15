"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardCheck,
  Database,
  FileCheck2,
  GitCompareArrows,
  LayoutDashboard,
  MessageSquareText,
  ScrollText,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV, navLabel, type NavIcon } from "@/components/shell/nav";
import { usePeople } from "@/components/common/people-context";
import { Tooltip } from "@/components/ui/tooltip";

const ICONS: Record<NavIcon, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  sources: Database,
  ledger: ScrollText,
  conflicts: GitCompareArrows,
  interview: MessageSquareText,
  review: ClipboardCheck,
  handover: FileCheck2,
  trust: ShieldCheck,
};

const COUNT_HINT: Record<string, string> = {
  sources: "Connected sources",
  claims: "Facts visible at your access level",
  openConflicts: "Open contradictions",
  openGaps: "Unanswered questions for the leaver",
  reviewPending: "Facts awaiting review",
  versions: "Approved versions",
  redactions: "Redactions applied before any LLM call",
};

export function Sidebar({
  slug,
  projectName,
  status,
  version,
  counts,
  hidden,
  handoverLine,
  footer,
}: {
  slug: string;
  projectName: string;
  status: string;
  version: number;
  counts: Record<string, number>;
  hidden: number;
  handoverLine: string;
  footer: React.ReactNode;
}) {
  const pathname = usePathname();
  const people = usePeople();
  const base = `/p/${slug}`;
  return (
    <aside data-shell="sidebar" className="sticky top-0 flex h-screen w-[232px] shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex h-12 items-center gap-2 border-b border-border px-4">
        <Link href="/" className="flex items-center gap-2 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <BatonMark />
          <span className="font-serif text-[15px] font-semibold tracking-tight">Baton</span>
        </Link>
      </div>
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[13px] font-semibold text-text">{projectName}</span>
          <span className="rounded border border-border bg-surface-2 px-1.5 py-px font-mono text-[11px] text-muted">
            v{version}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-subtle">
          <span
            className={cn(
              "size-1.5 rounded-full",
              status === "APPROVED" ? "bg-verified" : status === "IN_REVIEW" ? "bg-primary" : "bg-subtle",
            )}
          />
          {status === "IN_REVIEW" ? "In review" : status === "APPROVED" ? "Approved" : "Draft"}
          <span className="text-border">·</span>
          <span className="truncate">{handoverLine}</span>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-2" aria-label="Project">
        <ul className="space-y-px">
          {NAV.map((item) => {
            const href = base + item.href;
            const active = item.href === "" ? pathname === base : pathname.startsWith(href);
            const Icon = ICONS[item.icon];
            const count = item.countKey ? counts[item.countKey] : undefined;
            return (
              <li key={item.label}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary",
                    active ? "bg-surface-2 text-text" : "text-muted hover:bg-surface-2/60 hover:text-text",
                  )}
                >
                  {active && <span aria-hidden className="absolute -left-2 top-1.5 bottom-1.5 w-[2px] rounded-r bg-primary" />}
                  <Icon className={cn("size-4", active ? "text-primary" : "text-subtle group-hover:text-muted")} />
                  <span className="flex-1 truncate">{navLabel(item.label, people)}</span>
                  {count !== undefined && (
                    <Tooltip content={COUNT_HINT[item.countKey!]} side="right">
                      <span
                        className={cn(
                          "min-w-5 rounded px-1 text-center font-mono text-[11px] leading-[18px]",
                          item.countKey === "openConflicts" && count > 0
                            ? "bg-conflicting/15 text-conflicting"
                            : item.countKey === "openGaps" && count > 0
                              ? "bg-primary/12 text-primary"
                              : "bg-surface-2 text-subtle",
                        )}
                      >
                        {count}
                      </span>
                    </Tooltip>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
        {hidden > 0 && (
          <p className="mx-2.5 mt-3 rounded-md border border-dashed border-border px-2.5 py-2 text-xs leading-relaxed text-subtle">
            <span className="font-mono text-muted">{hidden}</span> fact{hidden === 1 ? "" : "s"} hidden at your access level.
          </p>
        )}
      </nav>
      <div className="border-t border-border px-4 py-3">{footer}</div>
    </aside>
  );
}

function BatonMark() {
  // A baton passed between two hands: two offset bars.
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <rect x="2" y="9.5" width="9" height="3" rx="1.5" fill="var(--subtle)" />
      <rect x="7" y="5.5" width="9" height="3" rx="1.5" fill="var(--primary)" />
    </svg>
  );
}
