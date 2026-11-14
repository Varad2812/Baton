import type { PersonaKey } from "@/lib/authz";

/** The tour always runs on the seeded demo project. */
export const TOUR_SLUG = "festflow";

/** Client-safe copy of the demo personas (authz.ts is server-only). */
export const TOUR_PERSONAS: Record<PersonaKey, { name: string; role: string }> = {
  meera: { name: "Meera Kulkarni", role: "OWNER" },
  rao: { name: "Prof. S. Rao", role: "REVIEWER" },
  arjun: { name: "Arjun Mehta", role: "INCOMING" },
  kabir: { name: "Kabir Shah", role: "OBSERVER" },
};

export type TourStep = {
  /** Value of the `data-tour` attribute the step anchors to. */
  target: string;
  /** Path under /p/[slug] ("" = dashboard) and optional query string. */
  path: string;
  query?: string;
  /** Persona the step must be viewed as; the tour switches the cookie before navigating. */
  persona: PersonaKey;
  title: string;
  body: string;
  placement?: "bottom" | "top" | "left" | "right";
};

export const TOUR_STEPS: TourStep[] = [
  {
    target: "kpis",
    path: "",
    persona: "meera",
    title: "The project at a glance",
    body: "Readiness, claims by grade and open gaps for FestFlow, computed from its connected sources. Nothing here is typed in by hand.",
  },
  {
    target: "ledger-claim",
    path: "/ledger",
    query: "?claim=clm_auth_supabase",
    persona: "meera",
    title: "Every claim has a receipt",
    body: "“Auth moved from Firebase to Supabase on 12 Mar” is Verified: its quotes were string-matched in PR #84, the #dev chat and the 14-Mar notes. The older Firebase claim shows as superseded, not as a conflict.",
    placement: "left",
  },
  {
    target: "conflict-payment",
    path: "/conflicts",
    persona: "meera",
    title: "When sources disagree, Baton says so",
    body: "Notes on 2 Apr say “Final: go with Razorpay”; #payments on 19 Apr says PhonePe trial creds just came. Both quotes sit side by side until the reviewer resolves it or asks the owner.",
  },
  {
    target: "interview",
    path: "/interview",
    persona: "meera",
    title: "Ask only what the records can't answer",
    body: "At most 10 questions for the departing lead, ranked by risk, such as who holds the production database password. Answers become testimony sources with their own badge.",
  },
  {
    target: "approve",
    path: "/review",
    persona: "rao",
    title: "The reviewer approves a version",
    body: "You're now Prof. Rao, the faculty coordinator. Approving freezes an immutable version with a diff against the last one. The departing owner can't approve their own handover.",
  },
  {
    target: "hidden-claim",
    path: "/handover",
    persona: "arjun",
    title: "The successor sees only what he may",
    body: "You're now Arjun, the incoming lead. Claims backed by the restricted sponsor budget are withheld on the server and never reach the model. He sees a placeholder and can request access.",
  },
  {
    target: "leakage",
    path: "/trust",
    persona: "arjun",
    title: "Proof: zero leaks",
    body: "A canary string is planted in the restricted budget sheet. Every role's compiled handover is scanned for it, and the count is 0 for each role.",
  },
];
