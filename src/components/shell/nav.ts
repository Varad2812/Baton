export const NAV = [
  { href: "", label: "Dashboard", icon: "dashboard", countKey: null },
  { href: "/sources", label: "Sources", icon: "sources", countKey: "sources" },
  { href: "/ledger", label: "Evidence Ledger", icon: "ledger", countKey: "claims" },
  { href: "/conflicts", label: "Conflicts", icon: "conflicts", countKey: "openConflicts" },
  { href: "/interview", label: "Gap Interview", icon: "interview", countKey: "openGaps" },
  { href: "/review", label: "Review", icon: "review", countKey: "reviewPending" },
  { href: "/handover", label: "Handover", icon: "handover", countKey: "versions" },
  { href: "/trust", label: "Trust", icon: "trust", countKey: "redactions" },
] as const;

export type NavIcon = (typeof NAV)[number]["icon"];
