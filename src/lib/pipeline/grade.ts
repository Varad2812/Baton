// Grade stage (pure). Rules from CLAUDE.md:
//   VERIFIED      = >=2 valid SUPPORTS quotes from >=2 distinct sources, or 1 from an authoritative source
//   SINGLE_SOURCE = exactly 1 (non-authoritative) source
//   INFERRED      = the model's own inference
//   CONFLICTING   = the claim is in an OPEN CONTRADICTS conflict
//   MISSING       = a checklist gap: no evidence at all

import type { Access, Grade } from "@/generated/prisma/enums";
import { joinLabels, sourceLabel } from "./labels";
import type { PChunk, PClaim, PConflict, PSource } from "./types";

const RANK: Record<Access, number> = { PUBLIC: 0, TEAM: 1, RESTRICTED: 2 };

export function maxAccessOf(levels: Access[], fallback: Access = "TEAM"): Access {
  if (!levels.length) return fallback;
  return levels.reduce<Access>((m, a) => (RANK[a] > RANK[m] ? a : m), "PUBLIC");
}

export type GradeLookup = {
  chunks: Map<string, PChunk>;
  sources: Map<string, PSource>;
};

export function lookupFrom(chunks: PChunk[], sources: PSource[]): GradeLookup {
  return {
    chunks: new Map(chunks.map((c) => [c.id, c])),
    sources: new Map(sources.map((s) => [s.id, s])),
  };
}

/** Distinct sources behind the valid SUPPORTS evidence, in evidence order. */
export function supportingSources(claim: Pick<PClaim, "evidence">, look: GradeLookup) {
  const seen = new Map<string, { source: PSource; chunk: PChunk }>();
  for (const e of claim.evidence) {
    if (!e.quoteValid || e.relation !== "SUPPORTS") continue;
    const chunk = look.chunks.get(e.chunkId);
    const source = chunk && look.sources.get(chunk.sourceId);
    if (!chunk || !source || seen.has(source.id)) continue;
    seen.set(source.id, { source, chunk });
  }
  return [...seen.values()];
}

export type GradeResult = { grade: Grade; gradeReason: string; access: Access };

export function gradeClaim(
  claim: Pick<PClaim, "evidence" | "isInference" | "grade" | "gradeReason" | "access">,
  look: GradeLookup,
  conflict?: { reason: string } | null,
): GradeResult {
  const support = supportingSources(claim, look);
  const labels = support.map((s) => sourceLabel(s.source, s.chunk));
  const accessLevels = claim.evidence
    .map((e) => look.chunks.get(e.chunkId)?.access)
    .filter((a): a is Access => !!a);
  const access = maxAccessOf(accessLevels, claim.access ?? "TEAM");

  if (conflict) return { grade: "CONFLICTING", gradeReason: conflict.reason, access };

  if (claim.isInference) {
    return {
      grade: "INFERRED",
      gradeReason: support.length
        ? `Inferred from ${joinLabels(labels)}; no record states it directly`
        : "Inferred by the model; no quote supports it directly",
      access,
    };
  }

  if (support.length === 0) {
    return {
      grade: "MISSING",
      gradeReason: claim.grade === "MISSING" && claim.gradeReason ? claim.gradeReason : "No record found",
      access,
    };
  }

  if (support.length >= 2) {
    return {
      grade: "VERIFIED",
      gradeReason: `${support.length} independent sources: ${joinLabels(labels)}`,
      access,
    };
  }

  const only = support[0];
  if (only.source.authoritative) {
    return { grade: "VERIFIED", gradeReason: `Authoritative source: ${labels[0]}`, access };
  }
  return { grade: "SINGLE_SOURCE", gradeReason: `1 source: ${labels[0]}`, access };
}

/** Human reason for a claim in an open conflict: "#payments 19-Apr contradicts notes 02-Apr (approved)". */
export function conflictReason(self: PClaim, other: PClaim, look: GradeLookup): string {
  const mine = joinLabels(supportingSources(self, look).map((s) => sourceLabel(s.source, s.chunk)), 2);
  const theirs = joinLabels(supportingSources(other, look).map((s) => sourceLabel(s.source, s.chunk)), 2);
  return `${theirs || "another record"} contradicts ${mine || "this claim"}: "${other.title}"`;
}

/** Re-grade every claim given the current conflicts. Returns new claim objects. */
export function gradeAll(claims: PClaim[], conflicts: PConflict[], look: GradeLookup): PClaim[] {
  const byId = new Map(claims.map((c) => [c.id, c]));
  const reasons = new Map<string, string>();
  for (const cf of conflicts) {
    if (cf.kind !== "CONTRADICTS" || cf.status !== "OPEN") continue;
    const a = byId.get(cf.claimAId);
    const b = byId.get(cf.claimBId);
    if (!a || !b) continue;
    if (!reasons.has(a.id)) reasons.set(a.id, conflictReason(a, b, look));
    if (!reasons.has(b.id)) reasons.set(b.id, conflictReason(b, a, look));
  }
  return claims.map((c) => {
    const reason = reasons.get(c.id);
    const g = gradeClaim(c, look, reason ? { reason } : null);
    return { ...c, ...g };
  });
}

/** DB rows have no isInference column: recover it from the stored grade/reason. */
export function inferIsInference(c: { grade: Grade; gradeReason: string }): boolean {
  return c.grade === "INFERRED" || /^Inferred\b/.test(c.gradeReason);
}
