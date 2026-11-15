export const NAV = [
  { href: "", label: "Dashboard", icon: "dashboard", countKey: null },
  { href: "/sources", label: "Sources", icon: "sources", countKey: "sources" },
  { href: "/ledger", label: "Facts & evidence", icon: "ledger", countKey: "claims" },
  { href: "/conflicts", label: "Conflicts", icon: "conflicts", countKey: "openConflicts" },
  { href: "/interview", label: "Questions for {owner}", icon: "interview", countKey: "openGaps" },
  { href: "/review", label: "Review & approve", icon: "review", countKey: "reviewPending" },
  { href: "/handover", label: "{successor}'s handover", icon: "handover", countKey: "versions" },
  { href: "/trust", label: "Safety checks", icon: "trust", countKey: "redactions" },
] as const;

export type NavIcon = (typeof NAV)[number]["icon"];

/** Fill {owner}/{successor} with the project's own first names. */
export function navLabel(label: string, people: { owner: string; successor: string }): string {
  return label.replace("{owner}", people.owner).replace("{successor}", people.successor);
}
