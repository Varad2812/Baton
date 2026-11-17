"use server";

import { z } from "zod";
import { writeAudit } from "@/lib/authz";
import { errorResult, okResult, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { ConflictError } from "@/lib/http";
import { actionContext } from "@/lib/server/action-context";
import { signShare } from "@/lib/share";

/** Read-only link to the successor's view of the latest approved version (expires in 7 days). */
export async function createShareLink(slug: string): Promise<ActionResult<{ path: string }>> {
  try {
    const { actor, project } = await actionContext(z.string().min(1).max(80).parse(slug));
    if (actor.role === "OBSERVER") throw new ConflictError("Observers cannot share the handover.");
    const h = await prisma.handover.findFirst({ where: { projectId: project.id }, select: { currentVersion: true } });
    if (!h?.currentVersion) throw new ConflictError("Approve a version first; only approved handovers can be shared.");
    const path = `/share/${signShare(project.id, h.currentVersion)}`;
    await writeAudit(prisma, { projectId: project.id, actor, action: "handover.share_link", targetType: "HandoverVersion", targetId: String(h.currentVersion), meta: { version: h.currentVersion, expiresInDays: 7 } });
    return okResult(`Read-only link to v${h.currentVersion} copied. It shows the successor's view and expires in 7 days.`, { path });
  } catch (e) {
    return errorResult(e);
  }
}
