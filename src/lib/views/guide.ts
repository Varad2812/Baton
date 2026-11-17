import { prisma } from "@/lib/db";
import { writeAudit, type Actor } from "@/lib/authz";

export type GuideState = {
  conflictsDone: boolean;
  approved: boolean;
  evidenceClaimId: string | null;
  /** Someone opened a fact's evidence in this project (audit "guide.evidence"). */
  evidenceChecked: boolean;
  asked: boolean;
  radarSeen: boolean;
  slackImported: boolean;
};

/** Done-state for every "Start here" step, from the database (no browser storage). */
export async function getGuideState(projectId: string): Promise<GuideState> {
  const [open, resolved, versions, claim, guideRows, slack] = await Promise.all([
    prisma.conflict.count({ where: { projectId, kind: "CONTRADICTS", status: "OPEN" } }),
    prisma.conflict.count({ where: { projectId, kind: "CONTRADICTS", status: "RESOLVED" } }),
    prisma.handoverVersion.count({ where: { handover: { projectId } } }),
    prisma.claim.findFirst({
      where: { projectId, grade: "VERIFIED", status: { not: "REJECTED" }, access: { not: "RESTRICTED" } },
      orderBy: [{ type: "asc" }, { date: "desc" }],
      select: { id: true },
    }),
    prisma.auditLog.groupBy({ by: ["action"], where: { projectId, action: { in: ["guide.evidence", "ask.answer", "guide.radar"] } }, _count: true }),
    prisma.source.count({ where: { projectId, externalId: { startsWith: "slack:" } } }),
  ]);
  const has = (a: string) => guideRows.some((r) => r.action === a);
  return {
    conflictsDone: open === 0 && resolved > 0,
    approved: versions > 0,
    evidenceClaimId: claim?.id ?? null,
    evidenceChecked: has("guide.evidence"),
    asked: has("ask.answer"),
    radarSeen: has("guide.radar"),
    slackImported: slack > 0,
  };
}

/** Record a guide milestone once per project (e.g. the first time anyone opens a fact's evidence). */
export async function markGuide(projectId: string, actor: Actor, action: "guide.evidence" | "guide.radar", targetId?: string) {
  const seen = await prisma.auditLog.findFirst({ where: { projectId, action }, select: { id: true } });
  if (seen) return;
  await writeAudit(prisma, { projectId, actor, action, targetType: action === "guide.evidence" ? "Claim" : "Project", targetId: targetId ?? projectId });
}
