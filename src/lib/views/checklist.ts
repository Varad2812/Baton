// The 12-item handover checklist (CLAUDE.md), evaluated over the claims a viewer can see.
import type { ClaimFull } from "@/lib/views/claims";
import { CHECKLIST as PIPELINE_CHECKLIST } from "@/lib/pipeline/checklist";

/** The 12 items and their sections come from the pipeline's checklist (one definition). */
export const CHECKLIST: { key: string; label: string; sections: string[] }[] = PIPELINE_CHECKLIST.map((c) => ({
  key: c.key,
  label: c.label,
  sections: [c.section],
}));

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
