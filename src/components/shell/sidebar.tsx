"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChartGantt,
  ChevronDown,
  ClipboardCheck,
  Database,
  FileCheck2,
  GitCompareArrows,
  LayoutDashboard,
  MessageSquareText,
  MessageSquareQuote,
  Radar,
  ScrollText,
  ShieldCheck,
} from "lucide-react";
import type { Role } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
import { FOOTER_NAV, GROUPS, isPrimary, NAV, navLabel, type GroupKey, type NavIcon, type NavItem } from "@/components/shell/nav";
import type { JourneyState } from "@/lib/views/journey";
import { usePeople } from "@/components/common/people-context";
import { Tooltip } from "@/components/ui/tooltip";
import { HelpMenu } from "@/components/shell/help-menu";

const ICONS: Record<NavIcon, React.ComponentType<{ className?: string }>> = {
  home: LayoutDashboard,
  sources: Database,
  ledger: ScrollText,
  conflicts: GitCompareArrows,
  radar: Radar,
  insights: ChartGantt,
  interview: MessageSquareText,
  review: ClipboardCheck,
  handover: FileCheck2,
  ask: MessageSquareQuote,
  trust: ShieldCheck,
};

const COUNT_HINT: Record<string, string> = {
  sources: "Connected sources",
  claims: "Facts visible at your access level",
  openConflicts: "Open contradictions",
  openGaps: "Unanswered questions for the leaver",
  reviewPending: "Facts awaiting review",
  versions: "Approved versions",
  redactions: "Redactions applied before any AI call",
};

const STATE_HINT: Record<JourneyState, string> = { done: "Done", current: "In progress", todo: "Not started" };
const MORE_KEY = "baton.nav.more";

export function Sidebar({
  slug,
  role,
  projectName,
  status,
  version,
  counts,
  hidden,
  handoverLine,
  journey,
}: {
  slug: string;
  role: Role;
  projectName: string;
  status: string;
  version: number;
  counts: Record<string, number>;
  hidden: number;
  handoverLine: string;
  journey: Record<Exclude<GroupKey, "overview">, JourneyState>;
}) {
  const pathname = usePathname();
  const people = usePeople();
  const base = `/p/${slug}`;
  const isActive = (item: NavItem) => (item.href === "" ? pathname === base : pathname === base + item.href || pathname.startsWith(base + item.href + "/"));
  const more = NAV.filter((n) => !isPrimary(role, n.href));
  const activeInMore = more.some(isActive);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    let saved = false;
    try {
      saved = localStorage.getItem(MORE_KEY) === "1";
    } catch {}
    const id = requestAnimationFrame(() => setMoreOpen(saved));
    return () => cancelAnimationFrame(id);
  }, []);
  const showMore = moreOpen || activeInMore;
  const toggleMore = () => {
    const v = !showMore;
    setMoreOpen(v);
    try {
      localStorage.setItem(MORE_KEY, v ? "1" : "0");
    } catch {}
  };

  const link = (item: NavItem) => {
    const active = isActive(item);
    const Icon = ICONS[item.icon];
    const count = item.countKey ? counts[item.countKey] : undefined;
    const publicOnly = role === "OBSERVER" && (item.href === "/ledger" || item.href === "/handover");
    return (
      <li key={item.href}>
        <Link
          href={base + item.href}
          aria-current={active ? "page" : undefined}
          className={cn(
            "group relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary",
            active ? "bg-surface-2 text-text" : "text-muted hover:bg-surface-2/60 hover:text-text",
          )}
        >
          {active && <span aria-hidden className="absolute -left-2 top-1.5 bottom-1.5 w-[2px] rounded-r bg-primary" />}
          <Icon className={cn("size-4 shrink-0", active ? "text-primary" : "text-subtle group-hover:text-muted")} />
          <span className="min-w-0 flex-1 truncate">
            {navLabel(item.label, people)}
            {publicOnly && <span className="ml-1.5 text-[11px] text-subtle">public</span>}
          </span>
          {item.href === "/handover" && (counts.newVersion ?? 0) > 0 ? (
            <span data-testid="new-version-badge" className="rounded bg-primary/15 px-1 font-mono text-[11px] leading-[18px] text-primary">
              v{counts.newVersion} new
            </span>
          ) : (
            count !== undefined && (
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
            )
          )}
        </Link>
      </li>
    );
  };

  return (
    <aside data-shell="sidebar" className="sticky top-0 flex h-screen w-[240px] shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex h-12 items-center gap-2 border-b border-border px-4">
        <Link href="/" className="flex items-center gap-2 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <BatonMark />
          <span className="font-serif text-[15px] font-semibold tracking-tight">Baton</span>
        </Link>
      </div>
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[13px] font-semibold text-text">{projectName}</span>
          <span className="rounded border border-border bg-surface-2 px-1.5 py-px font-mono text-[11px] text-muted">v{version}</span>
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-subtle">
          <span className={cn("size-1.5 rounded-full", status === "APPROVED" ? "bg-verified" : status === "IN_REVIEW" ? "bg-primary" : "bg-subtle")} />
          {status === "IN_REVIEW" ? "In review" : status === "APPROVED" ? "Approved" : "Draft"}
          <span className="text-border">·</span>
          <span className="truncate">{handoverLine}</span>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-2" aria-label="Project">
        {GROUPS.map((g) => {
          const items = NAV.filter((n) => n.group === g.key && isPrimary(role, n.href));
          if (g.key === "overview") return <ul key={g.key} className="mb-1 space-y-px">{items.map((i) => link(i))}</ul>;
          const state = journey[g.key];
          const first = NAV.find((n) => n.group === g.key)!;
          const header = (
            <>
              <span className="font-mono text-[10px] text-subtle">{g.step}</span>
              <span className="flex-1 text-[11px] font-medium uppercase tracking-[0.08em]">{g.label}</span>
              <Tooltip content={STATE_HINT[state]} side="right">
                <span
                  data-journey={state}
                  aria-label={STATE_HINT[state]}
                  className={cn("size-1.5 rounded-full", state === "done" ? "bg-verified" : state === "current" ? "bg-primary" : "border border-subtle")}
                />
              </Tooltip>
            </>
          );
          return (
            <div key={g.key} className="mt-2" data-journey-group={g.key}>
              {items.length ? (
                <div className="flex h-6 items-center gap-2 px-2.5 text-subtle">{header}</div>
              ) : (
                <Link
                  href={base + first.href}
                  className="flex h-6 items-center gap-2 rounded-md px-2.5 text-subtle outline-none hover:bg-surface-2/60 hover:text-muted focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label={`Step ${g.step}, ${g.label}: ${navLabel(first.label, people)} (${STATE_HINT[state].toLowerCase()})`}
                >
                  {header}
                </Link>
              )}
              {items.length > 0 && <ul className="space-y-px">{items.map((i) => link(i))}</ul>}
            </div>
          );
        })}

        {more.length > 0 && (
          <div className="mt-3 border-t border-border pt-2">
            <button
              type="button"
              onClick={toggleMore}
              aria-expanded={showMore}
              aria-controls="nav-more"
              data-nav-more
              className="flex h-7 w-full items-center gap-2 rounded-md px-2.5 text-xs text-subtle outline-none hover:bg-surface-2/60 hover:text-muted focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span className="flex-1 text-left">More</span>
              <span className="font-mono text-[11px]">{more.length}</span>
              <ChevronDown className={cn("size-3.5 transition-transform duration-150", showMore && "rotate-180")} />
            </button>
            <ul id="nav-more" hidden={!showMore} className="mt-px space-y-px">
              {more.map((i) => link(i))}
            </ul>
          </div>
        )}

        {hidden > 0 && (
          <p className="mx-2.5 mt-3 rounded-md border border-dashed border-border px-2.5 py-2 text-xs leading-relaxed text-subtle">
            <span className="font-mono text-muted">{hidden}</span> fact{hidden === 1 ? "" : "s"} hidden at your access level.
          </p>
        )}
        <ul className="mt-3 space-y-px border-t border-border pt-2">{FOOTER_NAV.map((i) => link(i))}</ul>
      </nav>
      <div className="border-t border-border px-2 py-2">
        <HelpMenu variant="sidebar" slug={slug} />
      </div>
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
