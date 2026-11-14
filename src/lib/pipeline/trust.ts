// Trust report data: quote validity, grades, redactions, accuracy vs ground truth (demo project),
// the committed live-run metrics, latest run and the audit log (meta only for OWNER/REVIEWER).

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Actor } from "@/lib/authz";
import { prisma } from "@/lib/db";
import truthJson from "../../../seed/ground-truth.json";
import { cachedResult, cacheHasProject } from "./cache";
import { scoreAgainstTruth, type GroundTruth } from "./score";
import { loadPriorState } from "./store";

export async function trustReport(actor: Actor, projectId: string, slug: string) {
  const [evidence, grades, redactions, latestRun, audit] = await Promise.all([
    prisma.evidence.groupBy({ by: ["quoteValid"], where: { claim: { projectId } }, _count: { _all: true } }),
    prisma.claim.groupBy({ by: ["grade"], where: { projectId, status: { not: "REJECTED" } }, _count: { _all: true } }),
    prisma.redaction.groupBy({ by: ["kind"], where: { chunk: { source: { projectId } } }, _count: { _all: true } }),
    prisma.pipelineRun.findFirst({ where: { projectId }, orderBy: { startedAt: "desc" } }),
    prisma.auditLog.findMany({ where: { projectId }, orderBy: { at: "desc" }, take: 50 }),
  ]);
  const total = evidence.reduce((n, e) => n + e._count._all, 0);
  const valid = evidence.find((e) => e.quoteValid)?._count._all ?? 0;

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
    quotes: { total, valid, invalid: total - valid, validity: total ? valid / total : 1 },
    grades: Object.fromEntries(grades.map((g) => [g.grade, g._count._all])),
    redactions: Object.fromEntries(redactions.map((r) => [r.kind, r._count._all])),
    accuracy,
    liveRun,
    latestRun,
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
