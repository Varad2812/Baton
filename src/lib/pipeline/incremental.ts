// Incremental pipeline: runs ONLY on chunks that arrived after the last run (Sync now, the GitHub
// webhook, Slack re-sync, Simulate new activity). Existing facts are never rewritten: reviewer edits,
// rejections, testimony and conflict resolutions stay exactly as they are. The delta is
//   - new facts (DRAFT) extracted from the new chunks,
//   - new evidence on an existing fact when a new chunk confirms it (same topic + type, same content),
//   - new conflicts between a new fact and an existing one (CONTRADICTS stays open; SUPERSEDES = evolution),
// followed by a re-grade of every fact it touched.
import type { Prisma } from "@/generated/prisma/client";
import type { ClaimType } from "@/generated/prisma/enums";
import { assertCan, writeAudit, type Actor } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { createLlmCtx, LlmInvalidOutputError, LlmUnavailableError, noLiveEngine, type LlmRunCtx } from "@/lib/llm";
import { claimDate, labelPairs, type ConflictPair, type PairLabel } from "./conflicts";
import { batchChunks, extractBatch, type ExtractedClaim } from "./extract";
import { lookupFrom } from "./grade";
import { randomId } from "./ids";
import { findQuote } from "./quotes";
import { RULE_BASED, ruleExtractBatch, ruleLabelPairs } from "./rules";
import { appendRawSources, type AppendResult } from "./sources";
import { loadPriorState, loadProjectData, regradeClaims, TX } from "./store";
import { jaccard, tokens } from "./text";
import type { PClaim, PConflict, StageRecord } from "./types";
import { validateExtracted, type RawExtracted } from "./validate";
import type { RawSource } from "./normalise";

export const STALE_RUN_MS = 5 * 60_000;

export class SyncBusyError extends Error {
  readonly status = 409;
  constructor() {
    super("A pipeline run or sync is already in progress for this project. Wait for it to finish and try again.");
    this.name = "SyncBusyError";
  }
}

/** Mark RUNNING rows older than 5 minutes as failed (a crashed or restarted server never finishes them). */
export async function reapStaleRuns(projectId: string) {
  await prisma.pipelineRun.updateMany({
    where: { projectId, status: "RUNNING", startedAt: { lt: new Date(Date.now() - STALE_RUN_MS) } },
    data: { status: "FAILED", finishedAt: new Date(), error: "Interrupted (no progress for 5 minutes)" },
  });
}

/** Claim the project's run lock (unique index on RUNNING rows). Throws SyncBusyError if taken. */
export async function acquireRunLock(projectId: string, model: string, mode: "LIVE" | "CACHED" = "LIVE") {
  await reapStaleRuns(projectId);
  try {
    return await prisma.pipelineRun.create({ data: { projectId, mode, status: "RUNNING", stages: [], model } });
  } catch (e) {
    if ((e as { code?: string })?.code === "P2002") throw new SyncBusyError();
    throw e;
  }
}

/** A prepared extraction (the simulated batch): quotes point at a source by externalId and are re-validated. */
export type PreparedExtraction = {
  claims: {
    key: string;
    confirms?: string;
    type?: ClaimType;
    section?: string;
    topicKey?: string;
    title?: string;
    statement?: string;
    owner?: string;
    date?: string;
    evidence: { source: string; quote: string }[];
    relates?: { claim: string; label: "CONTRADICTS" | "SUPERSEDES"; note: string }[];
  }[];
};

export type IncrementalResult = {
  runId: string | null;
  ingest: AppendResult;
  newFacts: { id: string; title: string }[];
  confirmed: { id: string; title: string }[];
  conflicts: { contradicts: number; supersedes: number };
  regraded: number;
  engine: string;
  ms: number;
};

type Opts = {
  actor: Actor;
  reason: "sync" | "simulate" | "webhook" | "slack";
  /** Map existing fact ids in a prepared extraction to this project's ids (sandbox suffix). */
  idFor?: (id: string) => string;
  prepared?: PreparedExtraction;
  llm?: LlmRunCtx;
  /** Skip the permission check (GitHub webhook acts as SYSTEM after signature verification). */
  system?: boolean;
};

const same = (a: PClaim, b: { title: string; statement: string }) =>
  jaccard(tokens(`${a.title} ${a.statement}`), tokens(`${b.title} ${b.statement}`)) >= 0.5;

/**
 * Ingest `raw` incrementally and run the pipeline on the new chunks only. Idempotent: a second call
 * with the same items ingests nothing and writes nothing (no run row, no audit row).
 */
export async function ingestIncremental(projectId: string, raw: RawSource[], opts: Opts): Promise<IncrementalResult> {
  if (!opts.system) assertCan(opts.actor, "connect_sources");
  const t0 = Date.now();
  const llm = opts.llm ?? createLlmCtx({ budget: 12 });
  const run = await acquireRunLock(projectId, opts.prepared ? "prepared" : llm.model);
  const stages: StageRecord[] = [];
  const stage = (name: StageRecord["stage"], counts: Record<string, number>, from: number, engine?: string) =>
    stages.push({ stage: name, status: "done", counts, ms: Date.now() - from, ...(engine ? { engine } : {}) });

  try {
    /* 1-2. Ingest + normalise (redaction before storage) */
    let t = Date.now();
    const ingest = await prisma.$transaction((tx) => appendRawSources(tx, projectId, raw), TX);
    stage("ingest", { sources: ingest.newSources.length + ingest.updatedSources.length, items: ingest.newItems, skipped: ingest.skippedItems }, t);
    stage("normalise", { chunks: ingest.newChunkIds.length, redactions: ingest.redactions }, t);
    if (!ingest.newChunkIds.length) {
      await prisma.pipelineRun.delete({ where: { id: run.id } });
      return { runId: null, ingest, newFacts: [], confirmed: [], conflicts: { contradicts: 0, supersedes: 0 }, regraded: 0, engine: "none", ms: Date.now() - t0 };
    }

    const { input } = await loadProjectData(projectId);
    const prior = await loadPriorState(projectId);
    const look = lookupFrom(input.chunks, input.sources);
    const fresh = new Set(ingest.newChunkIds);
    const newChunks = input.chunks.filter((c) => fresh.has(c.id));
    const sourceByExt = new Map(
      (await prisma.source.findMany({ where: { projectId, externalId: { not: null } }, select: { id: true, externalId: true } })).map((s) => [s.externalId!, s.id]),
    );

    /* 3. Extract (prepared batch, else the engine chain, else rules) */
    t = Date.now();
    let engine = "cache";
    const extracted: RawExtracted[] = [];
    const confirms: { claimId: string; quotes: { chunkId: string; quote: string }[] }[] = [];
    const relates = new Map<string, NonNullable<PreparedExtraction["claims"][number]["relates"]>>();
    const locate = (ext: string, quote: string) => {
      const sid = sourceByExt.get(ext);
      const c = newChunks.find((x) => x.sourceId === sid && findQuote(x.text, quote)) ?? input.chunks.find((x) => x.sourceId === sid && findQuote(x.text, quote));
      return c ? { chunkId: c.id, quote } : null;
    };
    if (opts.prepared) {
      engine = "prepared";
      for (const p of opts.prepared.claims) {
        const ev = p.evidence.map((e) => locate(e.source, e.quote)).filter((x): x is { chunkId: string; quote: string } => !!x);
        if (p.confirms) {
          confirms.push({ claimId: opts.idFor?.(p.confirms) ?? p.confirms, quotes: ev });
          continue;
        }
        extracted.push({
          type: p.type ?? "DECISION",
          title: p.title ?? p.key,
          statement: p.statement ?? "",
          topicKey: p.topicKey ?? p.key,
          section: (p.section ?? "Decisions") as ExtractedClaim["section"],
          checklistKeys: [],
          owner: p.owner ?? "",
          date: p.date ?? "",
          isInference: false,
          evidence: ev.map((e) => ({ ...e, relation: "SUPPORTS" as const })),
          batchId: "prepared",
          batchChunkIds: ev.map((e) => e.chunkId),
        });
        if (p.relates?.length) relates.set(p.title ?? p.key, p.relates);
      }
    } else {
      const batches = batchChunks(newChunks, input.sources);
      const sourcesById = new Map(input.sources.map((s) => [s.id, s]));
      const seen = new Set<string>();
      let rules = 0;
      for (const b of batches) {
        let claims: ExtractedClaim[];
        if (noLiveEngine(llm)) {
          claims = ruleExtractBatch(b, look.chunks, input.people, seen);
          rules++;
        } else {
          try {
            claims = await extractBatch(b, look.chunks, sourcesById, input.people, input.projectName, llm);
          } catch (e) {
            if (!(e instanceof LlmUnavailableError || e instanceof LlmInvalidOutputError)) throw e;
            claims = ruleExtractBatch(b, look.chunks, input.people, seen);
            rules++;
          }
        }
        extracted.push(...claims.map((c) => ({ ...c, batchId: b.id, batchChunkIds: b.chunkIds, ruleBased: rules > 0 })));
      }
      engine = rules === batches.length ? RULE_BASED : (llm.calls.find((c) => !c.cached)?.engine ?? "cache");
    }
    stage("extract", { chunks: newChunks.length, claims: extracted.length + confirms.length }, t, engine);

    /* 4. Validate quotes (deterministic), then merge into existing facts */
    t = Date.now();
    const v = validateExtracted(extracted, look.chunks, input.people, randomId);
    const live = prior.claims.filter((c) => c.status !== "REJECTED");
    const newClaims: PClaim[] = [];
    const addEvidence: { claimId: string; chunkId: string; quote: string; start: number; end: number }[] = [];
    for (const c of v.claims) {
      const match = live.find((p) => p.topicKey === c.topicKey && p.type === c.type && p.grade !== "MISSING" && same(p, c));
      if (match && !relates.has(c.title)) {
        for (const e of c.evidence) addEvidence.push({ claimId: match.id, chunkId: e.chunkId, quote: e.quote, start: e.matchStart ?? 0, end: e.matchEnd ?? 0 });
      } else newClaims.push(c);
    }
    for (const cf of confirms) {
      const target = live.find((p) => p.id === cf.claimId);
      if (!target) continue;
      for (const q of cf.quotes) {
        const ch = look.chunks.get(q.chunkId)!;
        const m = findQuote(ch.text, q.quote);
        if (m) addEvidence.push({ claimId: target.id, chunkId: ch.id, quote: ch.text.slice(m.start, m.end), start: m.start, end: m.end });
      }
    }
    const confirmedIds = [...new Set(addEvidence.map((e) => e.claimId))].filter((id) => !prior.claims.find((p) => p.id === id)?.evidence.some((e) => addEvidence.some((a) => a.claimId === id && a.chunkId === e.chunkId)));
    stage("validate", { quotes: v.stats.rawQuotes, valid: v.stats.validQuotes, dropped: v.stats.droppedQuotes, newFacts: newClaims.length, confirmed: confirmedIds.length }, t);

    /* 5-6. Conflicts between each new fact and existing facts on the same topic */
    t = Date.now();
    const existingPairs = new Set(prior.conflicts.map((c) => [c.claimAId, c.claimBId].sort().join("|")));
    const conflicts: PConflict[] = [];
    for (const n of newClaims) {
      const rel = relates.get(n.title);
      if (rel) {
        for (const r of rel) {
          const old = live.find((p) => p.id === (opts.idFor?.(r.claim) ?? r.claim));
          if (!old) continue;
          conflicts.push({ id: randomId("cf"), topicKey: n.topicKey, claimAId: old.id, claimBId: n.id, kind: r.label, status: r.label === "CONTRADICTS" ? "OPEN" : "RESOLVED", resolution: r.label === "SUPERSEDES" ? "B" : null, note: r.note });
        }
        continue;
      }
    }
    const candidates: ConflictPair[] = [];
    for (const n of newClaims.filter((x) => !relates.has(x.title))) {
      for (const p of live) {
        if (p.topicKey !== n.topicKey || p.grade === "MISSING" || p.topicKey.startsWith("gap:")) continue;
        if (existingPairs.has([p.id, n.id].sort().join("|"))) continue;
        const [a, b] = claimDate(p, look) <= claimDate(n, look) ? [p, n] : [n, p];
        candidates.push({ topicKey: n.topicKey, a, b });
      }
    }
    let labels: PairLabel[] = [];
    if (candidates.length) {
      if (noLiveEngine(llm)) labels = ruleLabelPairs(candidates);
      else
        labels = await labelPairs(candidates, look, llm).catch((e) => {
          if (e instanceof LlmUnavailableError || e instanceof LlmInvalidOutputError) return ruleLabelPairs(candidates);
          throw e;
        });
    }
    for (const l of labels) {
      const p = candidates[l.pair];
      if (!p || l.label === "CONSISTENT") continue;
      conflicts.push({ id: randomId("cf"), topicKey: p.topicKey, claimAId: p.a.id, claimBId: p.b.id, kind: l.label, status: l.label === "CONTRADICTS" ? "OPEN" : "RESOLVED", resolution: l.label === "SUPERSEDES" ? "B" : null, note: l.note || null });
    }
    const contradicts = conflicts.filter((c) => c.kind === "CONTRADICTS").length;
    stage("conflicts", { pairs: candidates.length + conflicts.length, contradicts, supersedes: conflicts.length - contradicts }, t);

    /* 7. Persist the delta and re-grade what it touched */
    t = Date.now();
    const regraded = await prisma.$transaction(async (tx) => {
      if (newClaims.length) {
        await tx.claim.createMany({
          data: newClaims.map((c) => ({
            id: c.id,
            projectId,
            type: c.type,
            section: c.section,
            title: c.title,
            statement: c.statement,
            topicKey: c.topicKey,
            ownerPersonId: c.ownerPersonId,
            date: c.date ? new Date(`${c.date}T00:00:00.000Z`) : null,
            grade: c.grade,
            gradeReason: c.gradeReason,
            status: "DRAFT",
            access: c.access,
            fromTestimony: false,
            reviewerNote: c.reviewerNote,
          })),
        });
        await tx.evidence.createMany({
          data: newClaims.flatMap((c) => c.evidence.map((e) => ({ id: e.id, claimId: c.id, chunkId: e.chunkId, quote: e.quote, relation: e.relation, quoteValid: true, matchStart: e.matchStart, matchEnd: e.matchEnd }))),
        });
      }
      if (addEvidence.length) {
        await tx.evidence.createMany({
          data: addEvidence.map((e) => ({ id: randomId("ev"), claimId: e.claimId, chunkId: e.chunkId, quote: e.quote, relation: "SUPPORTS" as const, quoteValid: true, matchStart: e.start, matchEnd: e.end })),
        });
      }
      if (conflicts.length) await tx.conflict.createMany({ data: conflicts.map((c) => ({ ...c, projectId })) });
      const touched = [...newClaims.map((c) => c.id), ...addEvidence.map((e) => e.claimId), ...conflicts.flatMap((c) => [c.claimAId, c.claimBId])];
      const changed = await regradeClaims(tx, projectId, [...new Set(touched)]);
      stage("grade", { regraded: changed.length }, t);
      await tx.pipelineRun.update({
        where: { id: run.id },
        data: { status: "SUCCEEDED", mode: opts.prepared ? "CACHED" : "LIVE", model: engine, stages: stages as unknown as Prisma.InputJsonValue, finishedAt: new Date() },
      });
      await writeAudit(tx, {
        projectId,
        actor: opts.system ? { name: "GitHub webhook", role: "SYSTEM" } : opts.actor,
        action: "sync.incremental",
        targetType: "PipelineRun",
        targetId: run.id,
        meta: {
          reason: opts.reason,
          engine,
          newSources: ingest.newSources.length,
          newItems: ingest.newItems,
          skippedItems: ingest.skippedItems,
          newChunks: ingest.newChunkIds.length,
          newFacts: newClaims.length,
          confirmed: confirmedIds.length,
          contradicts,
          supersedes: conflicts.length - contradicts,
          ms: Date.now() - t0,
        },
      });
      return changed.length;
    }, TX);

    return {
      runId: run.id,
      ingest,
      newFacts: newClaims.map((c) => ({ id: c.id, title: c.title })),
      confirmed: confirmedIds.map((id) => ({ id, title: prior.claims.find((p) => p.id === id)?.title ?? id })),
      conflicts: { contradicts, supersedes: conflicts.length - contradicts },
      regraded,
      engine,
      ms: Date.now() - t0,
    };
  } catch (e) {
    await prisma.pipelineRun
      .update({ where: { id: run.id }, data: { status: "FAILED", finishedAt: new Date(), error: ((e as Error)?.message ?? String(e)).slice(0, 1000), stages: stages as unknown as Prisma.InputJsonValue } })
      .catch(() => undefined);
    throw e;
  }
}
