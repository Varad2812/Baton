// Orchestrator: runPipeline(projectId, { mode }) with SSE-friendly progress events.
// LIVE: real stages via Gemini. If the model is unavailable or the budget runs out, the demo
// project finishes from seed/pipeline-cache.json (mode CACHED); other projects fail cleanly
// with nothing written. Results are written in ONE transaction at the end.

import type { RunMode } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { assertCan, writeAudit, type Actor } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { createLlmCtx, hasGeminiKey, LlmUnavailableError, type LlmRunCtx } from "@/lib/llm";
import { cachedResult, cacheHasProject } from "./cache";
import { gradeAll, lookupFrom } from "./grade";
import { applyPreservation } from "./preserve";
import { countBy, runStages, StageError } from "./stages";
import { loadPriorState, loadProjectData, persistResult, TX } from "./store";
import { STAGES, type Emit, type PClaim, type PipelineResult, type StageRecord } from "./types";

export class PipelineBusyError extends Error {
  readonly status = 409;
  constructor() {
    super("A pipeline run is already in progress for this project.");
    this.name = "PipelineBusyError";
  }
}

export class PipelineUnavailableError extends Error {
  readonly status = 503;
  constructor(message: string) {
    super(message);
    this.name = "PipelineUnavailableError";
  }
}

const g = globalThis as unknown as { __batonRuns?: Set<string> };
const running = (g.__batonRuns ??= new Set<string>());
const STALE_MS = 5 * 60_000;

export type RunOptions = {
  mode?: RunMode;
  actor: Actor;
  emit?: Emit;
  budget?: number;
  /** Delay between replayed stages in CACHED mode, so the stepper animates. */
  replayDelayMs?: number;
  /** Inject an LLM context (tests). */
  llm?: LlmRunCtx;
};

export function defaultMode(slug: string): RunMode {
  if (hasGeminiKey()) return "LIVE";
  return cacheHasProject(slug) ? "CACHED" : "LIVE";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Keep a stored (often hand-written) grade reason when the recomputed grade agrees. */
function regradeKeepingReasons(claims: PClaim[], result: Pick<PipelineResult, "conflicts">, look: ReturnType<typeof lookupFrom>) {
  const before = new Map(claims.map((c) => [c.id, c]));
  return gradeAll(claims, result.conflicts, look).map((c) => {
    const b = before.get(c.id);
    return b && b.grade === c.grade && b.gradeReason ? { ...c, gradeReason: b.gradeReason } : c;
  });
}

export async function runPipeline(projectId: string, opts: RunOptions) {
  const emit: Emit = opts.emit ?? (() => {});
  assertCan(opts.actor, "connect_sources");

  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const cacheable = cacheHasProject(project.slug);
  const requested: RunMode = opts.mode ?? defaultMode(project.slug);
  if (requested === "CACHED" && !cacheable) {
    throw new PipelineUnavailableError("There is no cached result for this project. Run it live instead.");
  }

  if (running.has(projectId)) throw new PipelineBusyError();
  const recent = await prisma.pipelineRun.findFirst({
    where: { projectId, status: "RUNNING", startedAt: { gt: new Date(Date.now() - STALE_MS) } },
  });
  if (recent) throw new PipelineBusyError();
  running.add(projectId);

  const llm = opts.llm ?? createLlmCtx({ budget: opts.budget });
  const run = await prisma.pipelineRun.create({
    data: { projectId, mode: requested, status: "RUNNING", stages: [], model: llm.model },
  });
  const t0 = Date.now();

  try {
    const { input, redactions } = await loadProjectData(projectId);
    const prior = await loadPriorState(projectId);
    const look = lookupFrom(input.chunks, input.sources);

    let mode: RunMode = requested;
    let result: PipelineResult;
    let stages: StageRecord[] = [];
    let notice: string | undefined;

    if (requested === "LIVE") {
      if (!input.chunks.length) throw new PipelineUnavailableError("This project has no sources yet. Connect or upload some first.");
      try {
        result = await runStages(input, llm, { emit, redactions });
        stages = result.stages;
      } catch (e) {
        const cause = e instanceof StageError ? e.cause : e;
        if (!(cause instanceof LlmUnavailableError) || !cacheable) {
          if (cause instanceof LlmUnavailableError) {
            throw new PipelineUnavailableError(`Live model unavailable (${cause.message}). Nothing was changed.`);
          }
          throw cause;
        }
        mode = "CACHED";
        notice = `Live model unavailable (${cause.message}); finished from the verified cache.`;
        const done = e instanceof StageError ? e.completed : [];
        result = cachedResult();
        stages = [...done];
        emit({ stage: e instanceof StageError ? e.stage : "extract", status: "skipped", message: notice });
        for (const s of result.stages) {
          if (stages.some((x) => x.stage === s.stage)) continue;
          await sleep(opts.replayDelayMs ?? 120);
          emit({ stage: s.stage, status: "done", counts: s.counts, ms: s.ms, message: "from cache" });
          stages.push(s);
        }
      }
    } else {
      result = cachedResult();
      for (const s of result.stages) {
        emit({ stage: s.stage, status: "running" });
        await sleep(opts.replayDelayMs ?? 250);
        emit({ stage: s.stage, status: "done", counts: s.counts, ms: s.ms, message: "from cache" });
        stages.push(s);
      }
      notice = "Replayed from the verified cache (no live model call).";
    }

    const chunkIds = new Set(input.chunks.map((c) => c.id));
    const preserved = applyPreservation(result, prior, chunkIds);
    const finalClaims = regradeKeepingReasons(preserved.claims, preserved, look);
    const final = { claims: finalClaims, conflicts: preserved.conflicts, gapQuestions: preserved.gapQuestions };

    const totals = {
      claims: final.claims.length,
      conflictsOpen: final.conflicts.filter((c) => c.kind === "CONTRADICTS" && c.status === "OPEN").length,
      gapQuestions: final.gapQuestions.length,
      ...countBy(final.claims.map((c) => c.grade)),
    };

    await prisma.$transaction(async (tx) => {
      await persistResult(tx, projectId, final);
      await tx.pipelineRun.update({
        where: { id: run.id },
        data: {
          mode,
          status: "SUCCEEDED",
          stages: stages as unknown as Prisma.InputJsonValue,
          finishedAt: new Date(),
          error: notice && mode === "CACHED" && requested === "LIVE" ? notice : null,
        },
      });
      await writeAudit(tx, {
        projectId,
        actor: opts.actor,
        action: "pipeline.run",
        targetType: "PipelineRun",
        targetId: run.id,
        meta: {
          requested,
          mode,
          ms: Date.now() - t0,
          llmCalls: llm.used,
          cacheHits: llm.calls.filter((c) => c.cached).length,
          preserved: preserved.report,
          totals,
        } as Prisma.InputJsonValue,
      });
    }, TX);

    emit({ stage: "done", status: "done", runId: run.id, mode, counts: totals, ms: Date.now() - t0, message: notice });
    return { runId: run.id, mode, totals, notice, stats: result.stats, llmCalls: llm.used };
  } catch (e) {
    const message = (e as Error)?.message ?? String(e);
    await prisma.pipelineRun
      .update({ where: { id: run.id }, data: { status: "FAILED", finishedAt: new Date(), error: message.slice(0, 1000) } })
      .catch(() => undefined);
    emit({ stage: "error", status: "error", runId: run.id, message });
    throw e;
  } finally {
    running.delete(projectId);
  }
}

export { STAGES };
