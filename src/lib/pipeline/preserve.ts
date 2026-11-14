// Re-run safety (pure). A new pipeline result never silently overwrites human work:
// - reviewer edits / rejections / notes carry onto the new claim with the same topicKey+type
//   (or the old claim is kept if the new run no longer produces one),
// - matched claims keep their old id (follow-ups and links stay valid),
// - testimony claims and answered gap questions are always kept,
// - resolved conflicts keep their resolution.

import type { PClaim, PConflict, PGapQuestion, PipelineResult } from "./types";

export type PriorState = { claims: PClaim[]; conflicts: PConflict[]; gapQuestions: PGapQuestion[] };

export type PreserveReport = {
  reusedIds: number;
  editsCarried: number;
  editedKept: number;
  testimonyKept: number;
  answeredKept: number;
  resolutionsKept: number;
};

const isTouched = (c: PClaim) =>
  c.status === "EDITED" || c.status === "APPROVED" || c.status === "REJECTED" || !!c.reviewerNote;

export function applyPreservation(
  next: Pick<PipelineResult, "claims" | "conflicts" | "gapQuestions">,
  prior: PriorState,
  existingChunkIds: Set<string>,
  maxQuestions = 10,
): { claims: PClaim[]; conflicts: PConflict[]; gapQuestions: PGapQuestion[]; report: PreserveReport } {
  const report: PreserveReport = { reusedIds: 0, editsCarried: 0, editedKept: 0, testimonyKept: 0, answeredKept: 0, resolutionsKept: 0 };
  const keepEvidence = (c: PClaim): PClaim => ({ ...c, evidence: c.evidence.filter((e) => existingChunkIds.has(e.chunkId)) });

  const claims: PClaim[] = next.claims.map((c) => ({ ...c, evidence: [...c.evidence] }));
  const idMap = new Map<string, string>(); // new id -> final id
  const matched = new Set<number>();

  /* 1. Testimony claims: always kept as they are. */
  const testimony = prior.claims.filter((c) => c.fromTestimony);
  const testimonyIds = new Set(testimony.map((c) => c.id));
  const testimonyTopics = new Set(testimony.map((c) => c.topicKey));

  /* 2. Match prior claims to new claims by topicKey + type. */
  const kept: PClaim[] = [];
  for (const p of prior.claims) {
    if (p.fromTestimony) continue;
    const idx = claims.findIndex(
      (n, i) => !matched.has(i) && !testimonyIds.has(n.id) && n.topicKey === p.topicKey && n.type === p.type,
    );
    if (idx >= 0) {
      matched.add(idx);
      const n = claims[idx];
      if (n.id !== p.id) {
        idMap.set(n.id, p.id);
        report.reusedIds++;
      }
      n.id = p.id;
      if (isTouched(p)) {
        report.editsCarried++;
        if (p.status === "EDITED" || p.status === "APPROVED") {
          n.title = p.title;
          n.statement = p.statement;
          n.section = p.section;
          n.ownerPersonId = p.ownerPersonId ?? n.ownerPersonId;
        }
        n.status = p.status;
        n.reviewerNote = p.reviewerNote;
      }
    } else if (isTouched(p)) {
      kept.push(keepEvidence(p));
      report.editedKept++;
    }
  }

  /* 3. Answered gap questions: kept; their generic MISSING claims are not re-created. */
  const answered = prior.gapQuestions.filter((q) => q.answer);
  const priorById = new Map(prior.claims.map((c) => [c.id, c]));
  const answeredTopics = new Set<string>();
  for (const q of answered) {
    const rc = q.relatedClaimId ? priorById.get(q.relatedClaimId) : undefined;
    if (rc) answeredTopics.add(rc.topicKey);
    if (q.kind === "MISSING" && q.checklistKey) answeredTopics.add(`gap:${q.checklistKey}`);
  }

  let finalClaims = [
    ...claims.filter(
      (c) =>
        !testimonyIds.has(c.id) &&
        !(c.grade === "MISSING" && (testimonyTopics.has(c.topicKey) || answeredTopics.has(c.topicKey))),
    ),
    ...kept,
    ...testimony.map(keepEvidence),
  ];
  report.testimonyKept = testimony.length;
  // Never two claims with one id.
  const seenIds = new Set<string>();
  finalClaims = finalClaims.filter((c) => (seenIds.has(c.id) ? false : (seenIds.add(c.id), true)));
  const finalIds = new Set(finalClaims.map((c) => c.id));
  const remap = (id: string) => idMap.get(id) ?? id;

  /* 4. Conflicts: remap ids, carry prior resolutions. */
  const pairKey = (a: string, b: string) => [a, b].sort().join("|");
  const priorByPair = new Map(prior.conflicts.map((c) => [pairKey(c.claimAId, c.claimBId), c]));
  const conflicts: PConflict[] = [];
  const seenPairs = new Set<string>();
  for (const c of next.conflicts) {
    const a = remap(c.claimAId);
    const b = remap(c.claimBId);
    if (!finalIds.has(a) || !finalIds.has(b)) continue;
    const k = pairKey(a, b);
    if (seenPairs.has(k)) continue;
    seenPairs.add(k);
    const p = priorByPair.get(k);
    const out: PConflict = { ...c, claimAId: a, claimBId: b };
    if (p) {
      out.id = p.id;
      if (p.kind === "CONTRADICTS" && (p.status === "RESOLVED" || p.resolution)) {
        out.kind = p.kind;
        out.status = p.status;
        out.resolution = p.resolution;
        out.note = p.note;
        report.resolutionsKept++;
      }
    }
    conflicts.push(out);
  }
  for (const p of prior.conflicts) {
    const k = pairKey(p.claimAId, p.claimBId);
    const humanTouched = p.kind === "CONTRADICTS" && (p.status === "RESOLVED" || !!p.resolution);
    if (!seenPairs.has(k) && humanTouched && finalIds.has(p.claimAId) && finalIds.has(p.claimBId)) {
      conflicts.push({ ...p });
      seenPairs.add(k);
      report.resolutionsKept++;
    }
  }

  /* 5. Gap questions: answered kept; new ones deduped; capped. */
  const finalById = new Map(finalClaims.map((c) => [c.id, c]));
  const keptAnswered = answered.map((q) => ({
    ...q,
    relatedClaimId: q.relatedClaimId && finalIds.has(q.relatedClaimId) ? q.relatedClaimId : null,
  }));
  report.answeredKept = keptAnswered.length;
  const answeredRelated = new Set(keptAnswered.map((q) => q.relatedClaimId).filter(Boolean));
  const answeredChecklist = new Set(keptAnswered.filter((q) => q.kind === "MISSING").map((q) => q.checklistKey));
  const priorOpen = new Map(
    prior.gapQuestions.filter((q) => !q.answer).map((q) => [`${q.kind}|${q.relatedClaimId}`, q]),
  );
  const fresh = next.gapQuestions
    .map((q) => ({ ...q, relatedClaimId: q.relatedClaimId ? remap(q.relatedClaimId) : null }))
    .filter((q) => {
      const rc = q.relatedClaimId ? finalById.get(q.relatedClaimId) : undefined;
      if (q.relatedClaimId && (!rc || rc.status === "REJECTED")) return false;
      if (q.relatedClaimId && answeredRelated.has(q.relatedClaimId)) return false;
      if (q.kind === "MISSING" && rc?.topicKey === `gap:${q.checklistKey}` && answeredChecklist.has(q.checklistKey)) return false;
      return true;
    })
    .map((q) => {
      const same = priorOpen.get(`${q.kind}|${q.relatedClaimId}`);
      return same ? { ...q, id: same.id } : q;
    })
    .sort((a, b) => b.priority - a.priority)
    .slice(0, Math.max(0, maxQuestions - keptAnswered.length));

  const gapQuestions = [...keptAnswered, ...fresh].sort((a, b) => b.priority - a.priority);
  const qIds = new Set<string>();
  return {
    claims: finalClaims,
    conflicts,
    gapQuestions: gapQuestions.filter((q) => (qIds.has(q.id) ? false : (qIds.add(q.id), true))),
    report,
  };
}
