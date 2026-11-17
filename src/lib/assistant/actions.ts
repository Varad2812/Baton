// Buttons an assistant answer may carry. Pure and shared by server and client: the server only
// passes ids from this list, the client maps them onto existing navigation and the setPersona action.

export const NAV_ACTIONS = {
  "nav:dashboard": { path: "", label: "Go to Home" },
  "nav:insights": { path: "/insights", label: "Go to Insights" },
  "nav:radar": { path: "/radar", label: "Go to Knowledge at risk" },
  "nav:sources": { path: "/sources", label: "Go to Sources" },
  "nav:ledger": { path: "/ledger", label: "Go to Facts" },
  "nav:conflicts": { path: "/conflicts", label: "Go to Conflicts" },
  "nav:interview": { path: "/interview", label: "Go to Questions for {owner}" },
  "nav:review": { path: "/review", label: "Go to Review & approve" },
  "nav:handover": { path: "/handover", label: "Go to {successor}'s handover" },
  "nav:trust": { path: "/trust", label: "Go to Safety checks" },
  "nav:ask": { path: "/ask", label: "Ask the handover" },
  "nav:new": { path: "/new", label: "Start your own handover", absolute: true },
} as const;

export const PERSONA_ACTIONS = {
  "persona:meera": { persona: "meera", label: "Switch to {ownerFull}" },
  "persona:rao": { persona: "rao", label: "Switch to {reviewer}" },
  "persona:arjun": { persona: "arjun", label: "Switch to {successorFull}" },
  "persona:kabir": { persona: "kabir", label: "Switch to {observer}" },
} as const;

export type NavActionId = keyof typeof NAV_ACTIONS;
export type PersonaActionId = keyof typeof PERSONA_ACTIONS;
export type AssistantActionId = NavActionId | PersonaActionId;

export const ACTION_IDS = [...Object.keys(NAV_ACTIONS), ...Object.keys(PERSONA_ACTIONS)] as AssistantActionId[];

export function isActionId(v: unknown): v is AssistantActionId {
  return typeof v === "string" && (ACTION_IDS as string[]).includes(v);
}

export type PeopleNames = { owner: string; ownerFull: string; successor: string; successorFull: string; reviewer: string; observer: string };

export function actionLabel(id: AssistantActionId, people: PeopleNames): string {
  const raw = id in NAV_ACTIONS ? NAV_ACTIONS[id as NavActionId].label : PERSONA_ACTIONS[id as PersonaActionId].label;
  return raw.replace(/\{(\w+)\}/g, (_, k: keyof PeopleNames) => people[k] ?? k);
}

/** Page keys as used in /p/[slug]/<page>; "landing" and "new" sit outside a project. */
export const PAGES = ["landing", "new", "dashboard", "insights", "radar", "sources", "ledger", "conflicts", "interview", "review", "handover", "ask", "trust"] as const;
export type PageKey = (typeof PAGES)[number];

export function pageFromPath(pathname: string): PageKey {
  if (pathname === "/" || pathname === "") return "landing";
  if (pathname.startsWith("/new")) return "new";
  const m = pathname.match(/^\/p\/[^/]+(?:\/([^/?#]+))?/);
  if (!m) return "landing";
  const seg = m[1];
  return (PAGES as readonly string[]).includes(seg ?? "") ? (seg as PageKey) : "dashboard";
}

export const PAGE_NAME: Record<PageKey, string> = {
  landing: "Landing page",
  new: "New project wizard",
  dashboard: "Home",
  insights: "Insights (timeline, evidence map, activity)",
  radar: "Knowledge at risk",
  sources: "Sources",
  ledger: "Facts",
  conflicts: "Conflicts",
  interview: "Questions for the owner (exit interview)",
  review: "Review & approve",
  handover: "Successor's handover",
  ask: "Ask the handover (cited questions about the project)",
  trust: "Safety checks",
};

/** Three starter questions per page, shown under the intro line. */
export function suggestedQuestions(page: PageKey, people: Pick<PeopleNames, "owner" | "successor">): string[] {
  switch (page) {
    case "landing":
      return ["What is Baton?", "How do I judge Baton quickly?", "How does Baton stop the AI from making things up?"];
    case "new":
      return ["How do I add my own project?", "What are Public, Team and Restricted?", "What does the pipeline do?"];
    case "dashboard":
      return ["What does Confirmed mean?", "What should I look at first?", "How many conflicts are open?"];
    case "insights":
      return ["What is the difference between a conflict and a supersession?", "What does the evidence map show?", "What does Confirmed mean?"];
    case "radar":
      return ["What is Knowledge at risk?", "What does Simulate new activity do?", "How does the exit interview work?"];
    case "sources":
      return ["What are Public, Team and Restricted?", "What does the pipeline do?", "Are secrets and personal details redacted?"];
    case "ledger":
      return ["What does AI inference mean?", "What does the evidence drawer show?", "How do I ask a question about the project?"];
    case "conflicts":
      return ["How many conflicts are open?", "How do I resolve a conflict?", "What is the difference between a conflict and a supersession?"];
    case "interview":
      return [`What is still missing?`, "What is testimony?", `How does the exit interview work?`];
    case "review":
      return ["How do I approve the handover?", `Why can't ${people.owner} approve?`, "What blocks approval?"];
    case "handover":
      return ["Why are some facts hidden?", "How do I ask a follow-up?", `What is in ${people.successor}'s 7-day plan?`];
    case "ask":
      return ["What is the difference between Ask Baton and Ask the handover?", "Why was my question refused?", "How are answers checked?"];
    case "trust":
      return ["What is the leakage test / canary?", "How does Baton stop the AI from making things up?", "Are secrets and personal details redacted?"];
  }
}
