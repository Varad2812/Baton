// The 12-item handover checklist (CLAUDE.md), evaluated over the claims a viewer can see.
import type { ClaimFull } from "@/lib/views/claims";

export const CHECKLIST: { key: string; label: string; sections: string[] }[] = [
  { key: "purpose_status", label: "Purpose & current status", sections: ["Purpose & status"] },
  { key: "run_deploy", label: "How to run / deploy", sections: ["Run & deploy"] },
  { key: "code_docs", label: "Where code & docs live", sections: ["Code & docs"] },
  { key: "credentials_owner", label: "Credentials & secrets owner", sections: ["Access & secrets"] },
  { key: "production_access", label: "Production accounts / access", sections: ["Access & secrets"] },
  { key: "open_work", label: "Open work with owners", sections: ["Open work"] },
  { key: "key_decisions", label: "Key decisions (last 90 days)", sections: ["Decisions"] },
  { key: "external_dependencies", label: "External dependencies / vendors", sections: ["Vendors & dependencies"] },
  { key: "key_contacts", label: "Key contacts", sections: ["Contacts"] },
  { key: "recurring_problems", label: "Recurring problems & fixes", sections: ["Recurring problems"] },
  { key: "upcoming_deadlines", label: "Upcoming deadlines", sections: ["Deadlines"] },
  { key: "review_approval", label: "Who reviews / approves changes", sections: ["Review & approval"] },
];

export type ChecklistState = "covered" | "partial" | "missing";

export type ChecklistRow = {
  key: string;
  label: string;
  state: ChecklistState;
  claims: number;
  verified: number;
  openGaps: number;
  missingClaims: number;
};

export function evaluateChecklist(
  claims: ClaimFull[],
  gaps: { checklistKey: string | null; answer: string | null }[],
): ChecklistRow[] {
  return CHECKLIST.map((item) => {
    const inSection = claims.filter((c) => item.sections.includes(c.section) && c.status !== "REJECTED");
    const real = inSection.filter((c) => c.grade !== "MISSING");
    const missingClaims = inSection.filter((c) => c.grade === "MISSING").length;
    const openGaps = gaps.filter((g) => g.checklistKey === item.key && !g.answer).length;
    const state: ChecklistState =
      real.length === 0 ? "missing" : openGaps > 0 || missingClaims > 0 ? "partial" : "covered";
    return {
      key: item.key,
      label: item.label,
      state,
      claims: real.length,
      verified: real.filter((c) => c.grade === "VERIFIED").length,
      openGaps,
      missingClaims,
    };
  });
}

export function checklistScore(rows: ChecklistRow[]): number {
  const pts = rows.reduce((s, r) => s + (r.state === "covered" ? 1 : r.state === "partial" ? 0.5 : 0), 0);
  return pts / rows.length;
}
