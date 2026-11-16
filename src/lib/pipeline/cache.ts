// seed/pipeline-cache.json as a PipelineResult (the FestFlow fallback when the model is unavailable).

import cacheJson from "../../../seed/pipeline-cache.json";
import { isDemoSlug } from "@/lib/demo";
import type { StageRecord, PClaim, PConflict, PGapQuestion, PipelineResult, PChunk, PSource } from "./types";

type CacheFile = {
  model: string;
  project: { id: string; slug: string };
  sources: PSource[];
  chunks: PChunk[];
  claims: (Omit<PClaim, "evidence" | "checklistKeys" | "isInference"> & { isInference?: boolean })[];
  evidence: (PClaim["evidence"][number] & { claimId: string })[];
  conflicts: PConflict[];
  gapQuestions: PGapQuestion[];
  pipelineRun: { stages: StageRecord[] };
};

export const PIPELINE_CACHE = cacheJson as unknown as CacheFile;
export const CACHE_PROJECT_SLUG = PIPELINE_CACHE.project.slug;

/** The demo template or a visitor's sandbox copy of it. */
export function cacheHasProject(slug: string): boolean {
  return slug === CACHE_PROJECT_SLUG || isDemoSlug(slug);
}

/**
 * Fresh copy of the cached result (callers may mutate). `suffix` ("~<key>") rewrites every id for a
 * sandbox copy, whose seeded rows carry the same suffix.
 */
export function cachedResult(suffix = ""): PipelineResult {
  const r = baseResult();
  if (!suffix) return r;
  const s = (id: string | null) => (id ? `${id}${suffix}` : id);
  return {
    ...r,
    claims: r.claims.map((c) => ({
      ...c,
      id: s(c.id)!,
      ownerPersonId: s(c.ownerPersonId),
      evidence: c.evidence.map((e) => ({ ...e, id: s(e.id)!, chunkId: s(e.chunkId)! })),
    })),
    conflicts: r.conflicts.map((c) => ({ ...c, id: s(c.id)!, claimAId: s(c.claimAId)!, claimBId: s(c.claimBId)! })),
    gapQuestions: r.gapQuestions.map((q) => ({ ...q, id: s(q.id)!, relatedClaimId: s(q.relatedClaimId), testimonySourceId: s(q.testimonySourceId) })),
  };
}

function baseResult(): PipelineResult {
  const evByClaim = new Map<string, PClaim["evidence"]>();
  for (const e of PIPELINE_CACHE.evidence) {
    const { claimId, ...rest } = e;
    const l = evByClaim.get(claimId) ?? [];
    l.push({ ...rest });
    evByClaim.set(claimId, l);
  }
  const checklistOf = new Map<string, string>();
  for (const g of PIPELINE_CACHE.gapQuestions) {
    if (g.relatedClaimId && g.checklistKey) checklistOf.set(g.relatedClaimId, g.checklistKey);
  }
  const claims: PClaim[] = PIPELINE_CACHE.claims.map((c) => ({
    ...c,
    isInference: !!c.isInference,
    checklistKeys: checklistOf.has(c.id) ? [checklistOf.get(c.id)!] : [],
    evidence: evByClaim.get(c.id) ?? [],
  }));
  const evidence = PIPELINE_CACHE.evidence;
  return {
    claims,
    conflicts: PIPELINE_CACHE.conflicts.map((c) => ({ ...c })),
    gapQuestions: PIPELINE_CACHE.gapQuestions.map((g) => ({ ...g })),
    stages: PIPELINE_CACHE.pipelineRun.stages.map((s) => ({ ...s, counts: { ...s.counts } })),
    stats: {
      rawClaims: claims.length,
      rawQuotes: evidence.length,
      validQuotes: evidence.filter((e) => e.quoteValid).length,
      droppedQuotes: 0,
      discardedClaims: 0,
      mergedClaims: 0,
    },
  };
}
