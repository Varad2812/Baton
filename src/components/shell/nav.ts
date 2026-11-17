import type { Role } from "@/generated/prisma/enums";

/** The handover journey. The sidebar groups pages by these steps (Overview has no number). */
export type GroupKey = "overview" | "collect" | "understand" | "gaps" | "approve" | "handover";
export const GROUPS: { key: GroupKey; step: number | null; label: string }[] = [
  { key: "overview", step: null, label: "Overview" },
  { key: "collect", step: 1, label: "Collect" },
  { key: "understand", step: 2, label: "Understand" },
  { key: "gaps", step: 3, label: "Fill gaps" },
  { key: "approve", step: 4, label: "Approve" },
  { key: "handover", step: 5, label: "Hand over" },
];

export type NavIcon = "home" | "sources" | "ledger" | "conflicts" | "radar" | "insights" | "interview" | "review" | "handover" | "ask" | "trust";
export type CountKey = "sources" | "claims" | "openConflicts" | "openGaps" | "reviewPending" | "versions" | "redactions";
export type NavItem = { href: string; label: string; icon: NavIcon; group: GroupKey; countKey: CountKey | null };

export const NAV: NavItem[] = [
  { href: "", label: "Home", icon: "home", group: "overview", countKey: null },
  { href: "/sources", label: "Sources", icon: "sources", group: "collect", countKey: "sources" },
  { href: "/ledger", label: "Facts", icon: "ledger", group: "understand", countKey: "claims" },
  { href: "/conflicts", label: "Conflicts", icon: "conflicts", group: "understand", countKey: "openConflicts" },
  { href: "/radar", label: "Knowledge at risk", icon: "radar", group: "understand", countKey: null },
  { href: "/insights", label: "Insights", icon: "insights", group: "understand", countKey: null },
  { href: "/interview", label: "Questions for {owner}", icon: "interview", group: "gaps", countKey: "openGaps" },
  { href: "/review", label: "Review & approve", icon: "review", group: "approve", countKey: "reviewPending" },
  { href: "/handover", label: "{successor}'s handover", icon: "handover", group: "handover", countKey: "versions" },
  { href: "/ask", label: "Ask the handover", icon: "ask", group: "handover", countKey: null },
];

/** Small links at the bottom of the sidebar. */
export const FOOTER_NAV: NavItem[] = [{ href: "/trust", label: "Safety checks", icon: "trust", group: "overview", countKey: "redactions" }];

/** What each persona sees first; everything else sits under "More". */
export const ROLE_PRIMARY: Record<Role, string[]> = {
  OWNER: ["", "/sources", "/interview", "/ledger", "/radar"],
  REVIEWER: ["", "/conflicts", "/review", "/ledger"],
  INCOMING: ["", "/handover", "/ask", "/ledger"],
  OBSERVER: ["", "/ledger", "/handover"],
};

export function isPrimary(role: Role, href: string): boolean {
  return ROLE_PRIMARY[role].includes(href);
}

/** The nav item a path under /p/[slug] belongs to ("" = Home). */
export function navItemFor(rest: string): NavItem {
  return [...NAV, ...FOOTER_NAV].find((n) => n.href !== "" && (rest === n.href || rest.startsWith(n.href + "/"))) ?? NAV[0];
}

/** Fill {owner}/{successor} with the project's own first names. */
export function navLabel(label: string, people: { owner: string; successor: string }): string {
  return label.replace("{owner}", people.owner).replace("{successor}", people.successor);
}
