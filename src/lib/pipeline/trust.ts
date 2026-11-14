// Trust report: the single implementation behind the Trust page and GET /api/projects/[slug]/trust.
// Quote validity (stored match flags, set by validate/recheckQuotes), grades, redactions, accuracy
// vs ground truth (scoreAgainstTruth, demo project only), canary leakage per role (leakageReport,
// the same scan role compilation uses), runs, and the audit log (meta only for OWNER/REVIEWER).

import { readFile } from "node:fs/promises";
import path from "node:path";
import { allowedAccess, canSeeChunk, type Actor } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { leakageReport } from "@/lib/handover/service";
import truthJson from "../../../seed/ground-truth.json";
import { cachedResult, cacheHasProject } from "./cache";
import { scoreAgainstTruth, type GroundTruth } from "./score";
import { loadPriorState } from "./store";

type StageRow = { stage: string; status: string; ms: number; counts: Record<string, number> };

export async function trustReport(actor: Actor, projectId: string, slug: string) {
  const [evidence, grades, redactions, runs, audit, viewerAllowed, leakage] = await Promise.all([
    prisma.evidence.findMany({
      where: { claim: { projectId } },
      select: { quoteValid: true, relation: true, chunk: { select: { source: { select: { kind: true } } } } },
    }),
    prisma.claim.groupBy({ by: ["grade"], where: { projectId, status: { not: "REJECTED" } }, _count: { _all: true } }),
    prisma.redaction.findMany({
      where: { chunk: { source: { projectId } } },
      include: { chunk: { select: { locator: true, access: true, sourceId: true, timestamp: true, source: { select: { title: true, kind: true } } } } },
      orderBy: { id: "asc" },
    }),
    prisma.pipelineRun.findMany({ where: { projectId }, orderBy: { startedAt: "desc" }, take: 10 }),
    prisma.auditLog.findMany({ where: { projectId }, orderBy: { at: "desc" }, take: 60 }),
    allowedAccess(actor.role, projectId),
    leakageReport(projectId),
  ]);

  /* Quotes */
  const total = evidence.length;
  const valid = evidence.filter((e) => e.quoteValid).length;
  const byKind = new Map<string, { valid: number; total: number }>();
  for (const e of evidence) {
    const k = e.chunk.source.kind;
    const v = byKind.get(k) ?? { valid: 0, total: 0 };
    v.total += 1;
    if (e.quoteValid) v.valid += 1;
    byKind.set(k, v);
  }
  const latestRun = runs[0] ?? null;
  const validateStage = ((latestRun?.stages ?? []) as StageRow[]).find((s) => s.stage === "validate");

  /* Accuracy vs ground truth (demo project only) */
  let accuracy = null;
  if (cacheHasProject(slug)) {
    const prior = await loadPriorState(projectId);
    accuracy = scoreAgainstTruth({ claims: prior.claims, conflicts: prior.conflicts }, truthJson as unknown as GroundTruth, cachedResult().claims);
  }
  const liveRun = cacheHasProject(slug)
    ? await readFile(path.join(process.cwd(), "seed", "pipeline-metrics.json"), "utf8")
        .then((t) => JSON.parse(t) as unknown)
        .catch(() => null)
    : null;

  const privileged = actor.role === "OWNER" || actor.role === "REVIEWER";
  return {
    quotes: {
      total,
      valid,
      invalid: total - valid,
      validity: total ? valid / total : 1,
      contradicts: evidence.filter((e) => e.relation === "CONTRADICTS").length,
      dropped: validateStage?.counts.dropped ?? 0,
      discarded: validateStage?.counts.claimsDiscarded ?? 0,
      byKind: [...byKind.entries()].sort((a, b) => b[1].total - a[1].total),
    },
    grades: Object.fromEntries(grades.map((g) => [g.grade, g._count._all])),
    redactions: redactions.map((r) => {
      const visible = canSeeChunk(viewerAllowed, r.chunk);
      return {
        id: r.id,
        kind: r.kind,
        placeholder: r.placeholder,
        mentionedBy: r.mentionedBy,
        source: visible ? r.chunk.source.title : "Restricted source",
        locator: visible ? r.chunk.locator : "—",
        access: r.chunk.access,
        at: r.chunk.timestamp,
      };
    }),
    accuracy,
    liveRun,
    latestRun,
    runs: runs.map((r) => ({
      id: r.id,
      mode: r.mode,
      status: r.status,
      model: r.model,
      startedAt: r.startedAt,
      ms: r.finishedAt ? r.finishedAt.getTime() - r.startedAt.getTime() : null,
      stages: (r.stages as StageRow[] | null) ?? [],
      error: r.error,
    })),
    leakage,
    audit: audit.map((a) => ({
      id: a.id,
      at: a.at,
      actorName: a.actorName,
      actorRole: a.actorRole,
      action: a.action,
      targetType: a.targetType,
      targetId: a.targetId,
      // Meta can quote claim text (incl. RESTRICTED claims): only for roles that may see everything.
      meta: privileged ? a.meta : null,
    })),
  };
}

export type TrustReport = Awaited<ReturnType<typeof trustReport>>;
