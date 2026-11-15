export type NextStepState = {
  openConflicts: number;
  openQuestions: number;
  versions: number;
  slug: string;
};
export type NextStep = { label: string; href: string; reason: string };

/** The single most useful thing to do next, derived from project state. */
export function nextStep(s: NextStepState, people: { owner: string; successor: string }): NextStep {
  const base = `/p/${s.slug}`;
  if (s.openConflicts > 0)
    return {
      label: `Resolve ${s.openConflicts} conflict${s.openConflicts === 1 ? "" : "s"}`,
      href: `${base}/conflicts`,
      reason: "Two sources disagree. A reviewer picks which one is right before approval.",
    };
  if (s.openQuestions > 0)
    return {
      label: `Answer ${s.openQuestions} question${s.openQuestions === 1 ? "" : "s"}`,
      href: `${base}/interview`,
      reason: `Only ${people.owner} knows these; the records do not say.`,
    };
  if (s.versions === 0)
    return {
      label: "Approve v1",
      href: `${base}/review`,
      reason: `Approval freezes the handover so ${people.successor} gets one signed-off version.`,
    };
  return {
    label: `Open ${people.successor}'s handover`,
    href: `${base}/handover`,
    reason: "The approved, role-safe plan the successor works from.",
  };
}
