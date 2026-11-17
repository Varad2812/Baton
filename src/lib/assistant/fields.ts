// Text fields that have a Smart Draft button. Pure and shared by server and client.
import type { Action } from "@/lib/authz";

export const DRAFT_FIELDS = [
  "project_description",
  "reject_reason",
  "reviewer_note",
  "edit_statement",
  "override_note",
  "approval_note",
  "followup_question",
  "followup_answer",
  "access_reason",
  "interview_answer",
  "conflict_note",
] as const;
export type DraftField = (typeof DRAFT_FIELDS)[number];

/** Testimony fields: the assistant may only rephrase the user's own notes. */
export const TESTIMONY_FIELDS: ReadonlySet<DraftField> = new Set(["interview_answer", "followup_answer"]);
export const isTestimonyField = (f: DraftField) => TESTIMONY_FIELDS.has(f);

export const TESTIMONY_REFUSAL = "Type a few words of what you know and I'll make it clear.";

export const FIELD_SPEC: Record<DraftField, { label: string; max: number; permission: Action | null; goal: string }> = {
  project_description: { label: "Project description", max: 140, permission: null, goal: "One sentence (8 to 140 characters) saying what the project is and who uses it." },
  reject_reason: { label: "Reason for rejecting a fact", max: 300, permission: "reject_claims", goal: "One short reason for rejecting this fact, for the audit log. Refer to the evidence." },
  reviewer_note: { label: "Reviewer note", max: 300, permission: "edit_claims", goal: "One short reviewer note about this fact (what was checked or what is still uncertain)." },
  edit_statement: { label: "Fact statement", max: 600, permission: "edit_claims", goal: "A clearer statement of this fact in 1 to 3 sentences, faithful to its quotes. Add nothing the quotes do not say." },
  override_note: { label: "Override note", max: 500, permission: "approve_version", goal: "A note (at least 10 characters) explaining why the reviewer approves despite the open blockers. Name the blockers and who follows up." },
  approval_note: { label: "Approval note", max: 500, permission: "approve_version", goal: "A short optional note recorded with the approved version." },
  followup_question: { label: "Follow-up question", max: 400, permission: "ask_followups", goal: "One clear, specific question for the departing owner about this fact or section." },
  followup_answer: { label: "Follow-up answer (testimony)", max: 4000, permission: "answer_followups", goal: "The owner's answer to the follow-up question, rephrased from their notes." },
  access_reason: { label: "Reason for requesting access", max: 300, permission: "ask_followups", goal: "One short reason why the successor needs the hidden facts in this section to do the job." },
  interview_answer: { label: "Exit interview answer (testimony)", max: 4000, permission: "answer_interview", goal: "The owner's answer to the interview question, rephrased from their notes." },
  conflict_note: { label: "Conflict resolution note", max: 300, permission: "resolve_conflicts", goal: "One short note for the audit log on how this conflict was settled, referring to the two sources." },
};

/** "Empty" notes: fewer than 3 letters or digits in total. */
export function notesAreEmpty(notes: string | null | undefined): boolean {
  return (notes ?? "").replace(/[^\p{L}\p{N}]/gu, "").length < 3;
}
