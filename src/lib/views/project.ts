// Project lookup and the counts shown in the app shell (sidebar badges, stepper).
import { cache } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import type { Actor } from "@/lib/authz";
import { loadClaims } from "@/lib/views/claims";

export const getProject = cache(async (slug: string) => {
  const project = await prisma.project.findUnique({ where: { slug } });
  if (!project) notFound();
  return project;
});

export type StageKey = "connect" | "reconstruct" | "verify" | "review" | "handover";
export type StageState = "done" | "active" | "todo";

export type ShellData = {
  project: { id: string; slug: string; name: string; description: string };
  handover: {
    status: "DRAFT" | "IN_REVIEW" | "APPROVED";
    currentVersion: number;
    from: string;
    to: string;
    reviewer: string;
  } | null;
  counts: {
    sources: number;
    claims: number;
    hidden: number;
    openConflicts: number;
    openGaps: number;
    reviewPending: number;
    versions: number;
    redactions: number;
  };
  stages: { key: StageKey; label: string; state: StageState; detail: string }[];
  lastRun: { mode: "CACHED" | "LIVE"; status: string; ms: number; at: Date } | null;
};

export const getShellData = cache(async (slug: string, actor: Actor): Promise<ShellData> => {
  const project = await getProject(slug);
  const [claims, sources, openConflictRows, openGapRows, handover, lastRun, evidence, redactions] = await Promise.all([
    loadClaims(project.id, actor),
    prisma.source.count({ where: { projectId: project.id } }),
    prisma.conflict.findMany({
      where: { projectId: project.id, status: "OPEN", kind: "CONTRADICTS" },
      select: { claimAId: true, claimBId: true },
    }),
    prisma.gapQuestion.findMany({
      where: { projectId: project.id, answer: null },
      select: { relatedClaimId: true },
    }),
    prisma.handover.findFirst({
      where: { projectId: project.id },
      include: {
        from: { select: { name: true } },
        to: { select: { name: true } },
        reviewer: { select: { name: true } },
        _count: { select: { versions: true } },
      },
    }),
    prisma.pipelineRun.findFirst({ where: { projectId: project.id }, orderBy: { startedAt: "desc" } }),
    prisma.evidence.groupBy({
      by: ["quoteValid"],
      where: { claim: { projectId: project.id } },
      _count: true,
    }),
    prisma.redaction.count({ where: { chunk: { source: { projectId: project.id } } } }),
  ]);

  const visibleIds = new Set(claims.visible.map((c) => c.id));
  const openConflicts = openConflictRows.filter((c) => visibleIds.has(c.claimAId) && visibleIds.has(c.claimBId)).length;
  const openGaps = openGapRows.filter((g) => !g.relatedClaimId || visibleIds.has(g.relatedClaimId)).length;
  const reviewPending = claims.visible.filter((c) => c.status === "DRAFT" || c.status === "EDITED").length;
  const validQuotes = evidence.find((e) => e.quoteValid)?._count ?? 0;
  const totalQuotes = evidence.reduce((s, e) => s + e._count, 0);
  const runDone = lastRun?.status === "SUCCEEDED";
  const hStatus = handover?.status ?? "DRAFT";

  const stages: ShellData["stages"] = [
    {
      key: "connect",
      label: "Connect",
      state: sources > 0 ? "done" : "active",
      detail: `${sources} sources`,
    },
    {
      key: "reconstruct",
      label: "Reconstruct",
      state: runDone ? "done" : sources > 0 ? "active" : "todo",
      detail: `${claims.visible.length + claims.hiddenCount} facts`,
    },
    {
      key: "verify",
      label: "Verify",
      state: runDone && totalQuotes > 0 ? (openConflicts > 0 || openGaps > 0 ? "active" : "done") : "todo",
      detail: `${validQuotes}/${totalQuotes} quotes`,
    },
    {
      key: "review",
      label: "Review",
      state: hStatus === "APPROVED" ? "done" : hStatus === "IN_REVIEW" ? "active" : "todo",
      detail: hStatus === "APPROVED" ? `v${handover?.currentVersion}` : "in review",
    },
    {
      key: "handover",
      label: "Handover",
      state: hStatus === "APPROVED" ? "active" : "todo",
      detail: hStatus === "APPROVED" ? "shared" : "not approved",
    },
  ];
  // Verify can be "active" in parallel with review; keep only the furthest active stage highlighted.
  const lastActive = stages.map((s) => s.state).lastIndexOf("active");
  stages.forEach((s, i) => {
    if (s.state === "active" && i < lastActive) s.state = "done";
  });

  return {
    project: { id: project.id, slug: project.slug, name: project.name, description: project.description },
    handover: handover
      ? {
          status: handover.status,
          currentVersion: handover.currentVersion,
          from: handover.from.name,
          to: handover.to.name,
          reviewer: handover.reviewer.name,
        }
      : null,
    counts: {
      sources,
      claims: claims.visible.length,
      hidden: claims.hiddenCount,
      openConflicts,
      openGaps,
      reviewPending,
      versions: handover?._count.versions ?? 0,
      redactions,
    },
    stages,
    lastRun: lastRun
      ? {
          mode: lastRun.mode,
          status: lastRun.status,
          ms: lastRun.finishedAt ? lastRun.finishedAt.getTime() - lastRun.startedAt.getTime() : 0,
          at: lastRun.startedAt,
        }
      : null,
  };
});
