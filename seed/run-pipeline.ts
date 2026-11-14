// npm run seed:pipeline [-- --budget 60] [--dry]
//
// Runs the LIVE pipeline (Gemini) on the FestFlow fixtures, scores it against
// seed/ground-truth.json, and replaces seed/pipeline-cache.json ONLY if the live result is at
// least as good as the current cache (recall and precision >= current, every stored quote exact,
// and seed/verify-cache.ts passes on the candidate). Always writes seed/pipeline-metrics.json.
// LLM responses are cached on disk in seed/.llm-cache/ (gitignored) so re-runs are free.

import "dotenv/config";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Access } from "../src/generated/prisma/enums";
import { createLlmCtx, fileCache, hasGeminiKey, LlmUnavailableError } from "../src/lib/llm";
import { cachedResult, PIPELINE_CACHE } from "../src/lib/pipeline/cache";
import { gradeAll, lookupFrom } from "../src/lib/pipeline/grade";
import { counterIds } from "../src/lib/pipeline/ids";
import { normaliseSources, type RawSource } from "../src/lib/pipeline/normalise";
import { applyPreservation } from "../src/lib/pipeline/preserve";
import { candidatesFor, scoreAgainstTruth, type GroundTruth, type Score } from "../src/lib/pipeline/score";
import { runStages, StageError } from "../src/lib/pipeline/stages";
import type { PChunk, PClaim, PConflict, PGapQuestion, PPerson, PSource, PipelineResult } from "../src/lib/pipeline/types";
import { GAP_QUESTIONS } from "./cache-src/claims";
import { SEED_DIR, loadFestflowSources, loadPeople } from "./lib/festflow-sources";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const BUDGET = Number(flag("budget") ?? 60);
const DRY = args.includes("--dry");
const OUT_DIR = path.join(SEED_DIR, ".out");
const CACHE_PATH = path.join(SEED_DIR, "pipeline-cache.json");
const CANDIDATE_PATH = path.join(OUT_DIR, "pipeline-cache.live.json");
const METRICS_PATH = path.join(SEED_DIR, "pipeline-metrics.json");

const truth = JSON.parse(readFileSync(path.join(SEED_DIR, "ground-truth.json"), "utf8")) as GroundTruth;
const current = JSON.parse(readFileSync(CACHE_PATH, "utf8")) as Record<string, unknown> & typeof PIPELINE_CACHE;

/* ------------------------------------------------------------------ input */

function festflowInput() {
  const people = loadPeople();
  const raw: RawSource[] = loadFestflowSources();
  // Testimony sources exist in the cache (answered interview questions); keep the same ids.
  GAP_QUESTIONS.forEach((g, i) => {
    if (!g.answer) return;
    const at = new Date(g.answer.at);
    const day = at.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
    raw.push({
      key: `src_testimony_${g.id}`,
      kind: "TESTIMONY",
      title: `Exit interview · Q${i + 1} answered by Meera Kulkarni`,
      access: "TEAM",
      authoritative: false,
      author: "meera-k",
      createdAt: at,
      mergeItems: false,
      items: [{ text: `Q${i + 1}: ${g.question}\nA (Meera Kulkarni, ${day}): ${g.answer.text}`, locator: `interview Q${i + 1}`, author: "meera-k", timestamp: at }],
    });
  });
  const { chunks } = normaliseSources(raw, people);
  const sources: PSource[] = raw.map((s) => ({
    id: s.key,
    kind: s.kind,
    title: s.title,
    uri: s.uri ?? null,
    access: s.access as Access,
    authoritative: s.authoritative,
    author: s.author ?? null,
    createdAt: s.createdAt.toISOString(),
    grantedToIncoming: !!s.grantedToIncoming,
  }));
  const pchunks: PChunk[] = chunks.map((c) => ({
    id: c.id,
    sourceId: c.sourceKey,
    ordinal: c.ordinal,
    text: c.text,
    locator: c.locator,
    author: c.author,
    timestamp: c.timestamp,
    access: c.access,
  }));
  const ppeople: PPerson[] = people.map((p) => ({ id: `per_${p.key}`, name: p.name, roleTitle: p.roleTitle ?? "", email: p.email ?? null, handles: p.handles }));
  // Sanity: the chunking must be identical to the committed cache (same ids, same text).
  const cached = new Map(PIPELINE_CACHE.chunks.map((c) => [c.id, c.text]));
  const drift = pchunks.filter((c) => cached.get(c.id) !== c.text).length;
  if (drift) throw new Error(`${drift} chunks differ from seed/pipeline-cache.json; run npm run seed:build-cache first`);
  return { projectId: PIPELINE_CACHE.project.id, projectName: "FestFlow", sources, chunks: pchunks, people: ppeople, redactions: chunks.reduce((n, c) => n + c.redactions.length, 0) };
}

/* ------------------------------------------------------------- id remap */

/** Give live claims the ground-truth ids they correspond to (so verify-cache and the UI keep working). */
function remapIds(res: { claims: PClaim[]; conflicts: PConflict[]; gapQuestions: PGapQuestion[] }, reference: PClaim[]) {
  const ref = new Map(reference.map((c) => [c.id, c]));
  const expectations: { id: string; topic?: string }[] = [
    ...truth.decisions.map((d) => ({ id: d.expectClaim, topic: d.topicKey })),
    ...truth.risks.map((d) => ({ id: d.expectClaim, topic: d.topicKey })),
    ...truth.gaps.map((d) => ({ id: d.expectClaim, topic: d.topicKey })),
    ...truth.recurring.map((d) => ({ id: d.expectClaim, topic: d.topicKey })),
    ...truth.conflicts.flatMap((c) => [{ id: c.a }, { id: c.b }]),
    ...truth.supersessions.flatMap((s) => [{ id: s.from }, { id: s.to }]),
  ];
  const keep = new Set(res.claims.filter((c) => c.fromTestimony).map((c) => c.id));
  const pairs: { expectId: string; liveId: string; score: number }[] = [];
  for (const e of expectations) {
    const exp = ref.get(e.id);
    if (!exp) continue;
    for (const c of candidatesFor(exp, res.claims.filter((x) => !keep.has(x.id)), e.topic)) pairs.push({ expectId: e.id, liveId: c.claim.id, score: c.score });
  }
  pairs.sort((a, b) => b.score - a.score);
  const map = new Map<string, string>();
  const used = new Set<string>();
  for (const p of pairs) {
    if (map.has(p.liveId) || used.has(p.expectId)) continue;
    map.set(p.liveId, p.expectId);
    used.add(p.expectId);
  }
  let n = 0;
  for (const c of res.claims) if (!keep.has(c.id) && !map.has(c.id)) map.set(c.id, `clm_live_${String(++n).padStart(3, "0")}`);
  const id = (x: string) => map.get(x) ?? x;
  let ev = 0;
  const claims = res.claims.map((c) => ({ ...c, id: id(c.id), evidence: c.evidence.map((e) => ({ ...e, id: `ev_${String(++ev).padStart(3, "0")}` })) }));
  const conflicts = res.conflicts.map((c, i) => ({ ...c, id: `cf_live_${i + 1}`, claimAId: id(c.claimAId), claimBId: id(c.claimBId) }));
  const gapQuestions = res.gapQuestions.map((q, i) => ({ ...q, id: q.answer ? q.id : `gq_live_${i + 1}`, relatedClaimId: q.relatedClaimId ? id(q.relatedClaimId) : null }));
  return { claims, conflicts, gapQuestions, matchedToTruth: used.size };
}

/* ------------------------------------------------------------- report */

const pct = (x: number | null) => (x === null ? "  n/a" : `${(x * 100).toFixed(1).padStart(5)}%`);

function table(live: Score | null, cur: Score) {
  const rows: [string, string, string][] = [];
  const cat = (s: Score | null, k: keyof Score["categories"]) => (s ? `${s.categories[k].found}/${s.categories[k].expected}` : "-");
  for (const k of ["decisions", "risks", "conflicts", "supersessions", "gaps", "recurring"] as const) rows.push([k, cat(live, k), cat(cur, k)]);
  rows.push(["recall", live ? pct(live.recall) : "-", pct(cur.recall)]);
  rows.push(["precision", live ? pct(live.precision) : "-", pct(cur.precision)]);
  rows.push(["F1", live ? pct(live.f1) : "-", pct(cur.f1)]);
  rows.push(["decision grades", live ? `${live.categories.decisions.gradeMatches}/12` : "-", `${cur.categories.decisions.gradeMatches}/12`]);
  rows.push(["quotes valid (raw model)", live ? pct(live.quoteValidity.raw) : "-", "n/a"]);
  rows.push(["quotes valid (stored)", live ? `${pct(live.quoteValidity.stored)} of ${live.quoteValidity.storedTotal}` : "-", `${pct(cur.quoteValidity.stored)} of ${cur.quoteValidity.storedTotal}`]);
  rows.push(["claims", String(live?.claims ?? "-"), String(cur.claims)]);
  rows.push(["canary in claims", String(live?.canaryInClaims ?? "-"), String(cur.canaryInClaims)]);
  const w = [26, 18, 18];
  console.log(`\n${"metric".padEnd(w[0])}${"live run".padEnd(w[1])}${"current cache".padEnd(w[2])}`);
  console.log("-".repeat(w[0] + w[1] + w[2]));
  for (const r of rows) console.log(`${r[0].padEnd(w[0])}${r[1].padEnd(w[1])}${r[2].padEnd(w[2])}`);
}

/* --------------------------------------------------------------- main */

async function main() {
  const reference = cachedResult().claims;
  const curScore = scoreAgainstTruth(cachedResult(), truth, reference);
  if (!hasGeminiKey()) {
    console.error("seed:pipeline: GEMINI_API_KEY is not set (.env). Nothing to do; the current cache stays.");
    table(null, curScore);
    process.exit(2);
  }

  const input = festflowInput();
  const ctx = createLlmCtx({ budget: BUDGET, cache: fileCache(path.join(SEED_DIR, ".llm-cache")) });
  console.log(`seed:pipeline: model ${ctx.model}, budget ${BUDGET} calls, ${input.chunks.length} chunks, ${input.sources.length} sources`);

  const t0 = Date.now();
  let result: PipelineResult;
  try {
    result = await runStages(input, ctx, {
      ids: counterIds(),
      redactions: input.redactions,
      emit: (e) => {
        if (e.status === "done") console.log(`  ${e.stage.padEnd(10)} ${String(e.ms).padStart(6)} ms  ${JSON.stringify(e.counts ?? {})}`);
        if (e.status === "error") console.log(`  ${e.stage.padEnd(10)} ERROR ${e.message}`);
      },
    });
  } catch (e) {
    const cause = e instanceof StageError ? e.cause : e;
    console.error(`seed:pipeline: live run failed${e instanceof StageError ? ` in ${e.stage}` : ""}: ${(cause as Error).message}`);
    if (cause instanceof LlmUnavailableError) console.error("The current cache stays. Calls used:", ctx.used);
    writeFileSync(
      METRICS_PATH,
      JSON.stringify({ generatedAt: new Date().toISOString(), model: ctx.model, ok: false, error: (cause as Error).message, llmCalls: ctx.used, current: curScore }, null, 2) + "\n",
    );
    process.exit(1);
  }
  const ms = Date.now() - t0;

  // Merge the interview testimony (not extracted; it comes from answered questions).
  const cache = cachedResult();
  const prior = {
    claims: cache.claims.filter((c) => c.fromTestimony),
    conflicts: [],
    gapQuestions: cache.gapQuestions.filter((q) => q.answer),
  };
  const preserved = applyPreservation(result, prior, new Set(input.chunks.map((c) => c.id)));
  const look = lookupFrom(input.chunks, input.sources);
  const regraded = { ...preserved, claims: gradeAll(preserved.claims, preserved.conflicts, look) };
  const remapped = remapIds(regraded, reference);

  const liveScore = scoreAgainstTruth(
    { claims: remapped.claims, conflicts: remapped.conflicts, rawQuotes: result.stats.rawQuotes, validQuotes: result.stats.validQuotes },
    truth,
    reference,
  );

  // Candidate cache in the exact committed shape.
  const count = (xs: string[]) => xs.reduce<Record<string, number>>((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {});
  const candidate = {
    ...current,
    generator: `live pipeline (npm run seed:pipeline), ${new Date().toISOString().slice(0, 10)}`,
    model: ctx.model,
    claims: remapped.claims.map((c) => {
      const row: Partial<PClaim> = { ...c };
      delete row.evidence;
      delete row.checklistKeys;
      return row;
    }),
    evidence: remapped.claims.flatMap((c) => c.evidence.map((e) => ({ ...e, claimId: c.id }))),
    conflicts: remapped.conflicts,
    gapQuestions: remapped.gapQuestions,
    pipelineRun: {
      ...current.pipelineRun,
      model: ctx.model,
      stages: result.stages,
      finishedAt: new Date(new Date((current.pipelineRun as unknown as { startedAt: string }).startedAt).getTime() + ms).toISOString(),
    },
    stats: {
      ...(current.stats as object),
      claims: remapped.claims.length,
      claimsByGrade: count(remapped.claims.map((c) => c.grade)),
      claimsByType: count(remapped.claims.map((c) => c.type)),
      claimsByAccess: count(remapped.claims.map((c) => c.access)),
      evidence: remapped.claims.reduce((n, c) => n + c.evidence.length, 0),
      conflictsOpen: remapped.conflicts.filter((c) => c.kind === "CONTRADICTS").length,
      supersessions: remapped.conflicts.filter((c) => c.kind === "SUPERSEDES").length,
      gapQuestions: remapped.gapQuestions.length,
      gapAnswered: remapped.gapQuestions.filter((q) => q.answer).length,
    },
  };
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(CANDIDATE_PATH, JSON.stringify(candidate, null, 2) + "\n");

  const verify = spawnSync(process.execPath, [path.join(SEED_DIR, "..", "node_modules", "tsx", "dist", "cli.mjs"), path.join(SEED_DIR, "verify-cache.ts"), CANDIDATE_PATH], { encoding: "utf8" });
  const verifyOk = verify.status === 0;
  const verifyErrors = (verify.stderr || verify.stdout).split("\n").filter((l) => l.trim().startsWith("- ")).map((l) => l.trim().slice(2));

  const better =
    verifyOk &&
    liveScore.quoteValidity.stored === 1 &&
    liveScore.canaryInClaims === 0 &&
    liveScore.recall >= curScore.recall &&
    liveScore.precision >= curScore.precision;
  const reasons: string[] = [];
  if (!verifyOk) reasons.push(`verify-cache failed (${verifyErrors.length} checks)`);
  if (liveScore.recall < curScore.recall) reasons.push(`recall ${pct(liveScore.recall).trim()} < ${pct(curScore.recall).trim()}`);
  if (liveScore.precision < curScore.precision) reasons.push(`precision ${pct(liveScore.precision).trim()} < ${pct(curScore.precision).trim()}`);
  if (liveScore.canaryInClaims) reasons.push("canary found in a claim");

  table(liveScore, curScore);
  const llm = { calls: ctx.used, cacheHits: ctx.calls.filter((c) => c.cached).length, budget: BUDGET };
  console.log(`\nLLM: ${llm.calls} network calls, ${llm.cacheHits} cache hits, ${(ms / 1000).toFixed(1)} s`);
  console.log(`stats: ${JSON.stringify(result.stats)}; ${remapped.matchedToTruth} live claims mapped to ground-truth ids`);

  const replaced = better && !DRY;
  if (replaced) {
    writeFileSync(CACHE_PATH, JSON.stringify(candidate, null, 2) + "\n");
    console.log("\nseed:pipeline: live result is at least as good; replaced seed/pipeline-cache.json");
  } else {
    console.log(`\nseed:pipeline: kept the current cache${DRY ? " (--dry)" : ""}. ${reasons.join("; ") || ""}`);
    console.log(`candidate written to ${path.relative(process.cwd(), CANDIDATE_PATH)}`);
  }
  if (verifyErrors.length) console.log(`verify-cache on candidate (first 8):\n${verifyErrors.slice(0, 8).map((e) => `  - ${e}`).join("\n")}`);

  writeFileSync(
    METRICS_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        model: ctx.model,
        ok: true,
        durationMs: ms,
        llm,
        stats: result.stats,
        stages: result.stages,
        live: liveScore,
        current: curScore,
        replaced,
        keptReason: replaced ? null : reasons.join("; ") || (DRY ? "dry run" : null),
        verify: { ok: verifyOk, errors: verifyErrors.slice(0, 20) },
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`metrics written to ${path.relative(process.cwd(), METRICS_PATH)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
