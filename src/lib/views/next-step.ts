import type { Role } from "@/generated/prisma/enums";

export type NextStepState = {
  openConflicts: number;
  openQuestions: number;
  versions: number;
  slug: string;
  /** Facts that changed since the latest approved version (0 when none or not approved yet). */
  changes?: number;
};
export type NextStep = { label: string; href: string; reason: string };
type People = { owner: string; successor: string; reviewer?: string };

const s = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The single most useful thing THIS persona can do next. Never points a role at an action it is not
 * allowed to take (a successor is not sent to resolve conflicts; an observer only reads).
 */
export function nextStep(st: NextStepState, people: People, role: Role = "OWNER"): NextStep {
  const base = `/p/${st.slug}`;
  const reviewer = people.reviewer ?? "the reviewer";
  const handover = { label: `Open ${people.successor}'s handover`, href: `${base}/handover`, reason: "The approved, role-safe plan the successor works from." };

  if (role === "OBSERVER") {
    return st.versions
      ? { ...handover, reason: "Read-only: you see the Public parts of the approved handover." }
      : { label: "Browse the facts", href: `${base}/ledger`, reason: "Read-only: you see Public facts with their quotes. Nothing to approve or answer." };
  }

  if (role === "INCOMING") {
    if (!st.versions)
      return {
        label: "Read the draft handover",
        href: `${base}/handover`,
        reason: `${reviewer} has not approved it yet. You can read the draft, ask questions about it and send follow-ups to ${people.owner}.`,
      };
    if (st.changes) return { label: "See what changed", href: `${base}/handover`, reason: `New records arrived after approval; ${reviewer} reviews them for the next version.` };
    return { label: "Open your handover", href: `${base}/handover`, reason: "Read it, acknowledge each section, and ask the handover anything." };
  }

  // The owner's own job comes first: only they can answer what the records don't say.
  if (role === "OWNER" && st.openQuestions > 0)
    return { label: `Answer ${s(st.openQuestions, "question")}`, href: `${base}/interview`, reason: `Only you know these; the records do not say.` };

  if (st.openConflicts > 0)
    return { label: `Resolve ${s(st.openConflicts, "conflict")}`, href: `${base}/conflicts`, reason: "Two sources disagree. Pick which one is right before approval." };

  if (role === "OWNER") {
    if (!st.versions) return { label: "Review the draft", href: `${base}/review`, reason: `${reviewer} approves it; you cannot approve your own handover.` };
    if (st.changes) return { label: "Review what changed", href: `${base}/review?changes=1`, reason: `${s(st.changes, "fact")} changed since approval; ${reviewer} approves the next version.` };
    return handover;
  }

  // REVIEWER
  if (st.changes) return { label: `Draft v${st.versions + 1}`, href: `${base}/review?changes=1`, reason: `${s(st.changes, "fact")} changed since v${st.versions}. Review only those, then approve.` };
  if (!st.versions)
    return {
      label: "Approve v1",
      href: `${base}/review`,
      reason: st.openQuestions
        ? `${s(st.openQuestions, "question")} for ${people.owner} still open; approve with an override note or wait for answers.`
        : `Approval freezes the handover so ${people.successor} gets one signed-off version.`,
    };
  return handover;
}
