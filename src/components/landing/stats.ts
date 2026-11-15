import { prisma } from "@/lib/db";

export type LandingStats = {
  sources: number;
  chunks: number;
  claims: number;
  grades: Record<"VERIFIED" | "SINGLE_SOURCE" | "INFERRED" | "CONFLICTING" | "MISSING", number>;
  verifiedPct: number;
  quotes: { valid: number; total: number };
  conflicts: number;
  supersessions: number;
  gaps: number;
  questions: { total: number; answered: number };
  redactions: number;
  leaks: number;
  canaryViews: number;
  byKind: Record<string, number>;
  handoverStatus: string | null;
  people: { from: string; to: string; reviewer: string } | null;
  versions: number;
  run: { mode: string; model: string; stages: number; ms: number } | null;
};

/**
 * Live numbers for the landing page, read from the FestFlow project. Returns null if the DB is
 * unreachable so the landing page still renders (stats show a dash instead of failing the page).
 */
export async function getLandingStats(slug = "festflow"): Promise<LandingStats | null> {
  try {
    const project = await prisma.project.findUnique({ where: { slug }, select: { id: true } });
    if (!project) return null;
    const projectId = project.id;
    const [byKind, byGrade, conflicts, questions, answered, evidence, validQuotes, chunks, redactions, handover, claimText, run] =
      await Promise.all([
        prisma.source.groupBy({ by: ["kind"], where: { projectId }, _count: true }),
        prisma.claim.groupBy({ by: ["grade"], where: { projectId, status: { not: "REJECTED" } }, _count: true }),
        prisma.conflict.groupBy({ by: ["kind"], where: { projectId }, _count: true }),
        prisma.gapQuestion.count({ where: { projectId } }),
        prisma.gapQuestion.count({ where: { projectId, answer: { not: null } } }),
        prisma.evidence.count({ where: { claim: { projectId } } }),
        prisma.evidence.count({ where: { claim: { projectId }, quoteValid: true } }),
        prisma.chunk.findMany({ where: { source: { projectId } }, select: { text: true, access: true } }),
        prisma.redaction.count({ where: { chunk: { source: { projectId } } } }),
        prisma.handover.findFirst({ where: { projectId }, select: { status: true, from: { select: { name: true } }, to: { select: { name: true } }, reviewer: { select: { name: true } }, _count: { select: { versions: true } } } }),
        prisma.claim.findMany({ where: { projectId }, select: { title: true, statement: true, access: true } }),
        prisma.pipelineRun.findFirst({
          where: { projectId, status: "SUCCEEDED" },
          orderBy: { startedAt: "desc" },
          select: { mode: true, model: true, stages: true },
        }),
      ]);
    const runStages = Array.isArray(run?.stages) ? (run.stages as { ms?: number }[]) : [];

    const grades = { VERIFIED: 0, SINGLE_SOURCE: 0, INFERRED: 0, CONFLICTING: 0, MISSING: 0 };
    for (const g of byGrade) grades[g.grade] = g._count;
    const claims = Object.values(grades).reduce((s, v) => s + v, 0);

    // Canary scan, same idea as the Trust page: for each restricted view (Observer = Public only,
    // Successor without grants = Public + Team), every canary that lives in a chunk the view may not
    // see must not appear in anything the view is shown.
    const views: string[][] = [["PUBLIC"], ["PUBLIC", "TEAM"]];
    let leaks = 0;
    for (const levels of views) {
      const hidden = chunks.filter((c) => !levels.includes(c.access));
      const canaries = new Set(hidden.flatMap((c) => [...c.text.matchAll(/CANARY-[A-Z0-9-]+/g)].map((m) => m[0])));
      const shown = [
        ...claimText.filter((c) => levels.includes(c.access)).map((c) => `${c.title}\n${c.statement}`),
        ...chunks.filter((c) => levels.includes(c.access)).map((c) => c.text),
      ].join("\n");
      for (const v of canaries) if (shown.includes(v)) leaks++;
    }

    return {
      sources: byKind.reduce((s, k) => s + k._count, 0),
      chunks: chunks.length,
      claims,
      grades,
      verifiedPct: claims ? Math.round((grades.VERIFIED / claims) * 100) : 0,
      quotes: { valid: validQuotes, total: evidence },
      conflicts: conflicts.find((c) => c.kind === "CONTRADICTS")?._count ?? 0,
      supersessions: conflicts.find((c) => c.kind === "SUPERSEDES")?._count ?? 0,
      gaps: grades.MISSING,
      questions: { total: questions, answered },
      redactions,
      leaks,
      canaryViews: views.length,
      byKind: Object.fromEntries(byKind.map((k) => [k.kind, k._count])),
      handoverStatus: handover?.status ?? null,
      people: handover ? { from: handover.from.name, to: handover.to.name, reviewer: handover.reviewer.name } : null,
      versions: handover?._count.versions ?? 0,
      run: run
        ? { mode: run.mode, model: run.model, stages: runStages.length, ms: runStages.reduce((t, st) => t + (st.ms ?? 0), 0) }
        : null,
    };
  } catch (err) {
    console.error("[landing] stats unavailable", err);
    return null;
  }
}
