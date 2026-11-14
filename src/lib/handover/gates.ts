// Approval gate (pure). One implementation for the review page and approveVersion on the server.
// Blockers stop approval unless the reviewer overrides with a written note; advisories never block.

export type Tier = "P1" | "P2" | "P3";

/** Priority = risk weight x dependent claims (pipeline/questions.ts). P1 is the "must answer before handover" tier. */
export function priorityTier(priority: number): Tier {
  if (priority >= 40) return "P1";
  if (priority >= 20) return "P2";
  return "P3";
}

export type GateConflict = { id: string; kind: string; status: string; topicKey: string; claimAId: string; claimBId: string };
export type GateQuestion = { id: string; kind: string; priority: number; question: string; answer: string | null; relatedClaimId: string | null };

export type Blocker = { kind: "conflict" | "p1_gap"; id: string; label: string };

export const OVERRIDE_NOTE_MIN = 10;

export function approvalBlockers(input: { conflicts: GateConflict[]; questions: GateQuestion[] }): Blocker[] {
  const open = input.conflicts.filter((c) => c.kind === "CONTRADICTS" && c.status === "OPEN");
  const resolvedClaims = new Set(
    input.conflicts.filter((c) => c.kind === "CONTRADICTS" && c.status === "RESOLVED").flatMap((c) => [c.claimAId, c.claimBId]),
  );
  const openClaims = new Set(open.flatMap((c) => [c.claimAId, c.claimBId]));
  const blockers: Blocker[] = open.map((c) => ({ kind: "conflict", id: c.id, label: `Open conflict: ${c.topicKey.replace(/_/g, " ")}` }));
  for (const q of input.questions) {
    if (q.answer || priorityTier(q.priority) !== "P1") continue;
    if (q.kind === "CONFLICT" && q.relatedClaimId) {
      // A conflict question is settled by resolving its conflict, and an open one is already listed above.
      if (resolvedClaims.has(q.relatedClaimId) || openClaims.has(q.relatedClaimId)) continue;
    }
    blockers.push({ kind: "p1_gap", id: q.id, label: `P1 gap unanswered: ${q.question}` });
  }
  return blockers;
}

export type ApprovalDecision = { ok: true; override: boolean } | { ok: false; reason: string };

export function decideApproval(blockers: Blocker[], opts: { override?: boolean; note?: string | null }): ApprovalDecision {
  if (!blockers.length) return { ok: true, override: false };
  const conflicts = blockers.filter((b) => b.kind === "conflict").length;
  const gaps = blockers.length - conflicts;
  const what = [conflicts && `${conflicts} open conflict${conflicts === 1 ? "" : "s"}`, gaps && `${gaps} unanswered P1 gap${gaps === 1 ? "" : "s"}`]
    .filter(Boolean)
    .join(" and ");
  if (!opts.override) return { ok: false, reason: `Approval blocked: ${what}. Resolve them, or tick Override and write a note.` };
  if ((opts.note ?? "").trim().length < OVERRIDE_NOTE_MIN) {
    return { ok: false, reason: `An override needs a note of at least ${OVERRIDE_NOTE_MIN} characters explaining why (${what}).` };
  }
  return { ok: true, override: true };
}
