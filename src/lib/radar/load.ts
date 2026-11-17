// Knowledge-at-risk radar (DB): everything is computed from what the viewer's role may see.
import { canSeeChunk, can, writeAudit, type Actor } from "@/lib/authz";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { createFollowUp } from "@/lib/handover/service";
import { BadRequestError, NotFoundError } from "@/lib/http";
import { randomId } from "@/lib/pipeline/ids";
import { loadClaims } from "@/lib/views/claims";
import { busFactorFromCommits } from "@/lib/views/dashboard";
import { scoreRadar, type RiskItem } from "./score";

export async function loadRadar(actor: Actor, projectId: string) {
  const [{ visible, allowed, hiddenCount }, chunks, people, handover, secrets] = await Promise.all([
    loadClaims(projectId, actor),
    prisma.chunk.findMany({
      where: { source: { projectId } },
      select: { id: true, text: true, access: true, sourceId: true, timestamp: true, source: { select: { kind: true } } },
    }),
    prisma.person.findMany({ where: { projectId }, select: { name: true, roleTitle: true }, orderBy: { name: "asc" } }),
    prisma.handover.findFirst({ where: { projectId }, include: { from: { select: { name: true } } } }),
    prisma.redaction.findMany({
      where: { kind: "SECRET", chunk: { source: { projectId } } },
      select: { mentionedBy: true, chunk: { select: { access: true, sourceId: true, locator: true } } },
    }),
  ]);
  const seen = chunks.filter((c) => canSeeChunk(allowed, c));
  const areas = busFactorFromCommits(seen.filter((c) => c.source.kind === "GITHUB_COMMIT"));
  const asOf = seen.reduce((m, c) => (c.timestamp && c.timestamp.toISOString() > m ? c.timestamp.toISOString() : m), "").slice(0, 10) || new Date().toISOString().slice(0, 10);
  const live = visible.filter((c) => c.status !== "REJECTED");
  const result = scoreRadar({
    owner: handover?.from.name ?? people[0]?.name ?? "the owner",
    people,
    areas,
    claims: live.map((c) => {
      const sup = c.evidence.filter((e) => e.relation === "SUPPORTS");
      return {
        id: c.id,
        title: c.title,
        type: c.type,
        section: c.section,
        grade: c.grade,
        status: c.status,
        date: c.date ? c.date.toISOString().slice(0, 10) : null,
        owner: c.owner?.name ?? null,
        sourceKinds: [...new Set(sup.map((e) => e.chunk.source.kind))],
        supports: new Set(sup.map((e) => e.chunk.sourceId)).size,
      };
    }),
    secrets: secrets.filter((r) => canSeeChunk(allowed, r.chunk)).map((r) => ({ mentionedBy: r.mentionedBy, where: r.chunk.locator.split(" ")[0] })),
    credentialsOwnerKnown: !live.some((c) => c.topicKey === "gap:credentials_owner" && c.grade === "MISSING"),
    asOf,
  });
  return { ...result, hiddenCount, asOf, owner: handover?.from.name ?? null };
}

export type RadarData = Awaited<ReturnType<typeof loadRadar>>;

/**
 * Act on one radar finding (re-derived on the server from the viewer's own radar, never trusted from
 * the client): owner/reviewer add an exit-interview question, the successor sends a follow-up, and
 * "Add to handover plan" flags the fact for the next version. Repeating it does not duplicate.
 */
export async function actOnRisk(actor: Actor, projectId: string, itemId: string) {
  const radar = await loadRadar(actor, projectId);
  const item = radar.items.find((i) => i.id === itemId);
  if (!item) throw new NotFoundError("Risk item");
  const question = questionFor(item, radar.owner);

  if (item.action.kind === "add_to_handover") {
    if (!can(actor.role, "edit_claims") || !item.claimId) throw new BadRequestError("Only the owner or the reviewer can add items to the handover plan.");
    const note = `Flagged on Knowledge at risk: ${item.detail} Needs an owner in the handover plan.`;
    const c = await prisma.claim.findFirst({ where: { id: item.claimId, projectId }, select: { reviewerNote: true, status: true } });
    if (c?.reviewerNote?.startsWith("Flagged on Knowledge at risk")) return { done: "already", message: "Already flagged for the handover plan." };
    await prisma.claim.update({ where: { id: item.claimId }, data: { reviewerNote: note, status: c?.status === "REJECTED" ? "REJECTED" : "EDITED" } });
    await writeAudit(prisma, { projectId, actor, action: "radar.flag", targetType: "Claim", targetId: item.claimId, meta: { item: item.id } });
    return { done: "flagged", message: "Flagged for the handover plan; the reviewer sees it in Review & approve." };
  }

  if (can(actor.role, "edit_claims")) {
    const existing = await findExistingQuestion(projectId, item, question);
    if (existing) return { done: "already", message: `Already in the questions for ${radar.owner?.split(" ")[0] ?? "the owner"}.`, questionId: existing.id };
    const q = await prisma.gapQuestion.create({
      data: {
        id: randomId("gq"),
        projectId,
        kind: item.kind === "single_owner" ? "SINGLE_OWNER" : item.kind === "conflict" ? "CONFLICT" : "MISSING",
        question,
        rationale: `Raised on Knowledge at risk: ${item.detail}`,
        priority: Math.max(20, Math.min(80, item.severity)),
        relatedClaimId: item.claimId,
        checklistKey: null,
      },
    });
    await writeAudit(prisma, { projectId, actor, action: "radar.ask", targetType: "GapQuestion", targetId: q.id, meta: { item: item.id } });
    return { done: "asked", message: `Added to the questions for ${radar.owner?.split(" ")[0] ?? "the owner"}.`, questionId: q.id };
  }
  if (can(actor.role, "ask_followups")) {
    const dup = await prisma.followUp.findFirst({ where: { handover: { projectId }, question, answer: null }, select: { id: true } });
    if (dup) return { done: "already", message: "Already sent as a follow-up." };
    await createFollowUp(actor, projectId, item.claimId ? { claimId: item.claimId, question } : { section: "General", question });
    return { done: "asked", message: "Sent as a follow-up; the answer becomes testimony." };
  }
  throw new BadRequestError("Your role is read-only here. The owner, reviewer or successor can act on this.");
}

/**
 * An open or answered question that already covers this finding: same text, same related fact, or
 * (single-owner areas) any SINGLE_OWNER question that names the same area.
 */
async function findExistingQuestion(projectId: string, item: RiskItem, question: string) {
  const or: Prisma.GapQuestionWhereInput[] = [{ question }];
  if (item.claimId) or.push({ relatedClaimId: item.claimId });
  if (item.kind === "single_owner") {
    const area = item.area.split("/").pop() ?? item.area;
    or.push({ kind: "SINGLE_OWNER", OR: [{ question: { contains: area, mode: "insensitive" } }, { rationale: { contains: area, mode: "insensitive" } }] });
  }
  return prisma.gapQuestion.findFirst({ where: { projectId, OR: or }, select: { id: true } });
}

export function questionFor(item: RiskItem, owner: string | null): string {
  switch (item.kind) {
    case "single_owner":
      return `Only ${item.person ?? owner} has worked on ${item.area}. How is it built, deployed and debugged, and who should own it next?`;
    case "secret_no_owner":
      return `${item.title}. Who owns this secret, where is it stored, and how is it rotated?`;
    case "one_source_decision":
      return `Is this still true, and where else is it recorded: "${item.title}"?`;
    case "no_written_doc":
      return `This was only decided in chat: "${item.title}". Can you write down the decision and the reason?`;
    default:
      return `What should the successor know about: "${item.title}"?`;
  }
}
