// Score a pipeline result against seed/ground-truth.json (pure). Used by `npm run seed:pipeline`
// and the Trust page. A live claim matches an expected claim when
//   word overlap (Jaccard) + 0.25 if they share an evidence chunk + 0.25 if the topicKey matches >= 0.4,
// and both are gaps (MISSING / testimony) or both are not.

import { tokens, jaccard } from "./text";
import type { PClaim, PConflict } from "./types";

export const MATCH_THRESHOLD = 0.4;

export type GroundTruth = {
  decisions: { topicKey: string; expectClaim: string; expectGrade?: string }[];
  risks: { topicKey: string; expectClaim: string; expectGrade?: string }[];
  gaps: { topicKey: string; expectClaim: string; checklistKey: string }[];
  recurring: { topicKey: string; expectClaim: string }[];
  conflicts: { topicKey: string; a: string; b: string }[];
  supersessions: { topicKey: string; from: string; to: string }[];
  canaries: { value: string }[];
};

export type ScoreInput = {
  claims: PClaim[];
  conflicts: PConflict[];
  /** Raw model quotes before validation (live runs). */
  rawQuotes?: number;
  validQuotes?: number;
};

export type CategoryScore = { expected: number; found: number; recall: number; gradeMatches?: number; missed: string[] };

export type Score = {
  categories: Record<"decisions" | "risks" | "gaps" | "recurring" | "conflicts" | "supersessions", CategoryScore>;
  recall: number;
  precision: number;
  f1: number;
  claims: number;
  matchedClaims: number;
  quoteValidity: { raw: number | null; stored: number; storedTotal: number };
  canaryInClaims: number;
};

const isGapLike = (c: PClaim) => c.grade === "MISSING" || c.fromTestimony;

export function matchScore(live: PClaim, expected: PClaim, truthTopic?: string): number {
  if (live.id === expected.id) return 10;
  if (isGapLike(live) !== isGapLike(expected)) return 0;
  const sim = jaccard(tokens(`${live.title} ${live.statement}`), tokens(`${expected.title} ${expected.statement}`));
  const chunks = new Set(expected.evidence.map((e) => e.chunkId));
  const shared = live.evidence.some((e) => chunks.has(e.chunkId));
  const topic = live.topicKey === expected.topicKey || (!!truthTopic && live.topicKey === truthTopic);
  return sim + (shared ? 0.25 : 0) + (topic ? 0.25 : 0);
}

/** Live claims matching an expected claim, best first. */
export function candidatesFor(expected: PClaim, live: PClaim[], truthTopic?: string): { claim: PClaim; score: number }[] {
  return live
    .map((claim) => ({ claim, score: matchScore(claim, expected, truthTopic) }))
    .filter((x) => x.score >= MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score);
}

export function scoreAgainstTruth(result: ScoreInput, truth: GroundTruth, reference: PClaim[]): Score {
  const ref = new Map(reference.map((c) => [c.id, c]));
  const live = result.claims.filter((c) => c.status !== "REJECTED");
  const cands = new Map<string, { claim: PClaim; score: number }[]>();
  const candIds = (expectId: string, topic?: string) => {
    if (!cands.has(expectId)) {
      const e = ref.get(expectId);
      cands.set(expectId, e ? candidatesFor(e, live, topic) : []);
    }
    return cands.get(expectId)!;
  };

  const claimCategory = (items: { expectClaim: string; topicKey: string; expectGrade?: string }[]): CategoryScore => {
    let found = 0;
    let gradeMatches = 0;
    const missed: string[] = [];
    for (const it of items) {
      const c = candIds(it.expectClaim, it.topicKey);
      if (c.length) {
        found++;
        if (it.expectGrade && c[0].claim.grade === it.expectGrade) gradeMatches++;
      } else missed.push(it.topicKey);
    }
    return { expected: items.length, found, recall: items.length ? found / items.length : 1, gradeMatches, missed };
  };

  const pairCategory = (items: { topicKey: string; a: string; b: string }[], kind: PConflict["kind"]): CategoryScore => {
    let found = 0;
    const missed: string[] = [];
    for (const it of items) {
      const as = new Set(candIds(it.a).map((x) => x.claim.id));
      const bs = new Set(candIds(it.b).map((x) => x.claim.id));
      const hit = result.conflicts.some(
        (c) => c.kind === kind && ((as.has(c.claimAId) && bs.has(c.claimBId)) || (as.has(c.claimBId) && bs.has(c.claimAId))),
      );
      if (hit) found++;
      else missed.push(it.topicKey);
    }
    return { expected: items.length, found, recall: items.length ? found / items.length : 1, missed };
  };

  const categories = {
    decisions: claimCategory(truth.decisions),
    risks: claimCategory(truth.risks),
    gaps: claimCategory(truth.gaps),
    recurring: claimCategory(truth.recurring),
    conflicts: pairCategory(truth.conflicts, "CONTRADICTS"),
    supersessions: pairCategory(truth.supersessions.map((s) => ({ topicKey: s.topicKey, a: s.from, b: s.to })), "SUPERSEDES"),
  };
  const expected = Object.values(categories).reduce((n, c) => n + c.expected, 0);
  const found = Object.values(categories).reduce((n, c) => n + c.found, 0);
  const recall = expected ? found / expected : 1;

  // Precision: share of extracted (non-gap) claims that correspond to a claim in the reference ledger.
  const extracted = live.filter((c) => !isGapLike(c));
  const refExtracted = reference.filter((c) => !isGapLike(c));
  const matched = extracted.filter((l) => refExtracted.some((r) => matchScore(l, r) >= MATCH_THRESHOLD)).length;
  const precision = extracted.length ? matched / extracted.length : 0;

  const evidence = live.flatMap((c) => c.evidence);
  const canaries = truth.canaries.map((c) => c.value);
  return {
    categories,
    recall,
    precision,
    f1: recall + precision ? (2 * recall * precision) / (recall + precision) : 0,
    claims: live.length,
    matchedClaims: matched,
    quoteValidity: {
      raw: result.rawQuotes ? (result.validQuotes ?? 0) / result.rawQuotes : null,
      stored: evidence.length ? evidence.filter((e) => e.quoteValid).length / evidence.length : 1,
      storedTotal: evidence.length,
    },
    canaryInClaims: live.filter((c) => canaries.some((v) => `${c.title} ${c.statement}`.includes(v))).length,
  };
}
