import { prisma } from "@/lib/db";

export type GuideState = {
  conflictsDone: boolean;
  approved: boolean;
  evidenceClaimId: string | null;
};

/** Done-state for the "Start here" steps that the database can answer (the rest is tracked in the browser). */
export async function getGuideState(projectId: string): Promise<GuideState> {
  const [open, resolved, versions, claim] = await Promise.all([
    prisma.conflict.count({ where: { projectId, kind: "CONTRADICTS", status: "OPEN" } }),
    prisma.conflict.count({ where: { projectId, kind: "CONTRADICTS", status: "RESOLVED" } }),
    prisma.handoverVersion.count({ where: { handover: { projectId } } }),
    prisma.claim.findFirst({
      where: { projectId, grade: "VERIFIED", status: { not: "REJECTED" }, access: { not: "RESTRICTED" } },
      orderBy: [{ type: "asc" }, { date: "desc" }],
      select: { id: true },
    }),
  ]);
  return { conflictsDone: open === 0 && resolved > 0, approved: versions > 0, evidenceClaimId: claim?.id ?? null };
}
