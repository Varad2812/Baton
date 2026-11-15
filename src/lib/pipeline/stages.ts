// runStages: the DB-free pipeline core shared by the route handler and `npm run seed:pipeline`.
// Ingest/normalise already happened when sources were uploaded (redaction before storage), so
// those two stages report what is loaded. LlmUnavailableError propagates to the caller, which
// decides whether to finish from the cache.

import { LlmInvalidOutputError, LlmUnavailableError, noLiveEngine, type Engine, type LlmRunCtx } from "@/lib/llm";
import { RULE_BASED, ruleExtractBatch, ruleLabelPairs } from "./rules";
import { applyLabels, labelPairs, pairCandidates } from "./conflicts";
import { batchChunks, extractBatch } from "./extract";
import { buildGapClaims, runChecklist, singleOwnerAreas, singleOwnerClaim, specificGaps } from "./gaps";
import { gradeAll, lookupFrom } from "./grade";
import { randomId, type IdGen } from "./ids";
import { buildCandidates, phraseQuestions, rankQuestions, toGapQuestions } from "./questions";
import type { Emit, PClaim, PipelineInput, PipelineResult, StageName, StageRecord } from "./types";
import { applyCanonical, canonicaliseTopics, validateExtracted, type RawExtracted } from "./validate";

export class StageError extends Error {
  constructor(
    readonly stage: StageName,
    readonly cause: unknown,
    readonly completed: StageRecord[],
  ) {
    super(`${stage}: ${(cause as Error)?.message ?? String(cause)}`);
    this.name = "StageError";
  }
}

export type RunStagesOpts = {
  ids?: IdGen;
  emit?: Emit;
  /** Number of redactions applied at ingest (reported by the normalise stage). */
  redactions?: number;
  /** false = no rule-based fallback: LlmUnavailableError propagates (the caller finishes from the cache). */
  ruleFallback?: boolean;
};

export async function runStages(input: PipelineInput, ctx: LlmRunCtx, opts: RunStagesOpts = {}): Promise<PipelineResult> {
  const ids = opts.ids ?? randomId;
  const emit = opts.emit ?? (() => {});
  const stages: StageRecord[] = [];
  const look = lookupFrom(input.chunks, input.sources);
  // Once a stage fails, work still in flight (parallel extract batches) must stay silent.
  let aborted = false;

  // Engines used per stage: from the LLM call log plus rule-based fallbacks taken in this stage.
  let ruleUsed = false;
  const engineOf = (from: number): string | undefined => {
    const used = new Set<string>(ctx.calls.slice(from).map((c) => (c.engine === "gemini" || c.engine === "groq" ? c.engine : "cache")));
    if (ruleUsed) used.add(RULE_BASED);
    return used.size ? [...used].join("+") : undefined;
  };
  /** Run an LLM step; if no engine is reachable, use the deterministic fallback. */
  async function orRules<T>(live: () => Promise<T>, rules: () => T): Promise<T> {
    if (opts.ruleFallback === false) return live();
    if (noLiveEngine(ctx)) {
      ruleUsed = true;
      return rules();
    }
    try {
      return await live();
    } catch (e) {
      if (!(e instanceof LlmUnavailableError) && !(e instanceof LlmInvalidOutputError)) throw e;
      ruleUsed = true;
      return rules();
    }
  }

  async function stage<T>(name: StageName, fn: () => Promise<{ value: T; counts: Record<string, number> }>): Promise<T> {
    const t0 = Date.now();
    const callsBefore = ctx.calls.length;
    ruleUsed = false;
    emit({ stage: name, status: "running" });
    try {
      const { value, counts } = await fn();
      const ms = Date.now() - t0;
      const engine = engineOf(callsBefore);
      stages.push({ stage: name, status: "done", counts, ms, ...(engine ? { engine } : {}) });
      emit({ stage: name, status: "done", counts, ms, ...(engine ? { message: engine } : {}) });
      return value;
    } catch (e) {
      aborted = true;
      emit({ stage: name, status: "error", ms: Date.now() - t0, message: (e as Error)?.message });
      throw new StageError(name, e, [...stages]);
    }
  }

  const extractable = input.sources.filter((s) => s.kind !== "TESTIMONY");

  await stage("ingest", async () => ({
    value: null,
    counts: { sources: extractable.length, testimony: input.sources.length - extractable.length },
  }));

  await stage("normalise", async () => ({
    value: null,
    counts: { chunks: input.chunks.length, redactions: opts.redactions ?? 0, people: input.people.length },
  }));

  /* 3. Extract */
  const raw = await stage("extract", async () => {
    const batches = batchChunks(input.chunks, input.sources);
    const sourcesById = new Map(input.sources.map((s) => [s.id, s]));
    let done = 0;
    let skipped = 0;
    let ruleBatches = 0;
    const seen = new Set<string>();
    const results = await Promise.all(
      batches.map(async (b) => {
        try {
          const claims = await orRules(
            () => extractBatch(b, look.chunks, sourcesById, input.people, input.projectName, ctx),
            () => {
              ruleBatches++;
              return ruleExtractBatch(b, look.chunks, input.people, seen).map((c) => ({ ...c, ruleBased: true }));
            },
          );
          return claims.map<RawExtracted>((c) => ({ ...c, batchId: b.id, batchChunkIds: b.chunkIds }));
        } catch (e) {
          if (e instanceof LlmInvalidOutputError) {
            skipped++;
            return [];
          }
          throw e;
        } finally {
          done++;
          if (!aborted) emit({ stage: "extract", status: "running", counts: { batches: batches.length, done } });
        }
      }),
    );
    const flat = results.flat();
    return { value: flat, counts: { batches: batches.length, skipped, claims: flat.length, ruleBased: ruleBatches } };
  });

  /* 4. Validate quotes, canonicalise topics, merge duplicates */
  const validated = await stage("validate", async () => {
    const v = validateExtracted(raw, look.chunks, input.people, ids);
    const canon = await orRules(
      () => canonicaliseTopics(v.claims, ctx),
      () => v.claims.map((c) => ({ topicKey: c.topicKey, sameAs: -1 })),
    );
    const merged = applyCanonical(v.claims, canon);
    return {
      value: { claims: merged.claims, stats: { ...v.stats, mergedClaims: merged.merged } },
      counts: {
        quotes: v.stats.rawQuotes,
        valid: v.stats.validQuotes,
        dropped: v.stats.droppedQuotes,
        claimsDiscarded: v.stats.discardedClaims,
        merged: merged.merged,
      },
    };
  });

  /* 5. Grade (before conflicts; conflicted claims are re-graded in stage 6) */
  let claims: PClaim[] = await stage("grade", async () => {
    const graded = gradeAll(validated.claims, [], look);
    return { value: graded, counts: countBy(graded.map((c) => c.grade)) };
  });

  /* 6. Conflicts */
  const conflicts = await stage("conflicts", async () => {
    const pairs = pairCandidates(claims, look);
    const labels = pairs.length ? await orRules(() => labelPairs(pairs, look, ctx), () => ruleLabelPairs(pairs)) : [];
    const cfs = applyLabels(pairs, labels, ids);
    claims = gradeAll(claims, cfs, look);
    return {
      value: cfs,
      counts: {
        pairs: pairs.length,
        contradicts: cfs.filter((c) => c.kind === "CONTRADICTS").length,
        supersedes: cfs.filter((c) => c.kind === "SUPERSEDES").length,
      },
    };
  });

  /* 7. Gaps: single owners + checklist + specific missing facts */
  const singleOwnerIds = await stage("gaps", async () => {
    const soIds = new Set<string>();
    for (const area of singleOwnerAreas(input.chunks, input.sources, input.people)) {
      const existing = claims.find((c) => c.topicKey === area.topicKey && c.type === "RISK");
      if (existing) {
        existing.isInference = true;
        soIds.add(existing.id);
        continue;
      }
      const c = singleOwnerClaim(area, look.chunks, ids);
      claims.push(c);
      soIds.add(c.id);
    }
    const checklist = runChecklist(claims);
    const specific = await orRules(() => specificGaps(checklist, claims, ctx), () => []);
    const gapClaims = buildGapClaims(checklist, specific, ids);
    claims = gradeAll([...claims, ...gapClaims], conflicts, look);
    return {
      value: soIds,
      counts: {
        checklist: checklist.length,
        met: checklist.filter((c) => c.met).length,
        missing: gapClaims.length,
        singleOwner: soIds.size,
      },
    };
  });

  /* 8. Questions */
  const gapQuestions = await stage("questions", async () => {
    const ranked = rankQuestions(buildCandidates(claims, conflicts, look, singleOwnerIds));
    const drafts = toGapQuestions(ranked, ids);
    const qs = await orRules(() => phraseQuestions(drafts, claims, ctx), () => drafts);
    return { value: qs, counts: { candidates: ranked.length, questions: qs.length } };
  });

  return {
    claims,
    conflicts,
    gapQuestions,
    stages,
    engine: engineLabel(ctx, stages),
    stats: {
      rawClaims: validated.stats.rawClaims,
      rawQuotes: validated.stats.rawQuotes,
      validQuotes: validated.stats.validQuotes,
      droppedQuotes: validated.stats.droppedQuotes,
      discardedClaims: validated.stats.discardedClaims,
      mergedClaims: validated.stats.mergedClaims,
    },
  };
}

/** Run-level engine label stored in PipelineRun.model: "groq:<model>", "<gemini model>", "rule-based" or "cache". */
export function engineLabel(ctx: LlmRunCtx, stages: StageRecord[]): string {
  const net = ctx.calls.filter((c) => !c.cached && (c.engine === "gemini" || c.engine === "groq"));
  const groq = net.find((c) => c.engine === "groq");
  const rules = stages.some((s) => s.engine?.includes(RULE_BASED));
  const extractRules = stages.find((s) => s.stage === "extract")?.engine === RULE_BASED;
  if (extractRules || (!net.length && rules)) return RULE_BASED;
  if (groq) return `groq:${groq.model}`;
  if (net.length) return net[0].model ?? ctx.model;
  return rules ? RULE_BASED : "cache";
}

export function countBy(xs: string[]): Record<string, number> {
  return xs.reduce<Record<string, number>>((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {});
}
