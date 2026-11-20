import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { projectPersonas } from "@/lib/authz";
import { getVisitorId } from "@/lib/visitor";
import { NotFoundError, BadRequestError } from "@/lib/http";

const digest = (secret: string) => createHash("sha256").update(secret).digest("hex");
const week = 7 * 86400_000;

export async function ownedTeam(slug: string) {
  const vid = await getVisitorId();
  const project = vid && await prisma.project.findFirst({ where: { slug, visitorId: vid, kind: "STANDARD" } });
  if (!project) throw new NotFoundError("Team project");
  return project;
}

export async function issueInvitation(slug: string, role: "REVIEWER" | "INCOMING") {
  const project = await ownedTeam(slug);
  const secret = randomBytes(32).toString("base64url");
  await prisma.$transaction(async tx => {
    await tx.project.update({ where: { id: project.id }, data: { teamMode: true } });
    await tx.teamInvite.updateMany({ where: { projectId: project.id, role, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.teamInvite.create({ data: { projectId: project.id, role, tokenHash: digest(secret), expiresAt: new Date(Date.now() + week) } });
  });
  return secret;
}

export async function redeemInvitation(secret: string) {
  const vid = await getVisitorId();
  if (!vid || !/^[\w-]{43}$/.test(secret)) throw new BadRequestError("This invitation is invalid.");
  const invite = await prisma.teamInvite.findUnique({ where: { tokenHash: digest(secret) }, include: { project: { select: { visitorId: true } } } });
  if (!invite || invite.revokedAt || invite.expiresAt <= new Date()) throw new BadRequestError("This invitation has expired or was revoked.");
  if (invite.project.visitorId === vid) throw new BadRequestError("Send this link to the invited teammate. The project owner already has access.");
  const claimed = await prisma.teamInvite.updateMany({
    where: { id: invite.id, revokedAt: null, expiresAt: { gt: new Date() }, OR: [{ visitorId: null }, { visitorId: vid }] },
    data: { visitorId: vid },
  });
  if (!claimed.count) throw new BadRequestError("This invitation was already accepted in another browser.");
  return invite.id;
}

export async function teamSession(id: string) {
  const vid = await getVisitorId();
  const invite = vid && await prisma.teamInvite.findFirst({
    where: { id, visitorId: vid, revokedAt: null, expiresAt: { gt: new Date() }, project: { teamMode: true, kind: "STANDARD" } },
    include: { project: { select: { slug: true, name: true } } },
  });
  if (!invite || (invite.role !== "REVIEWER" && invite.role !== "INCOMING")) throw new NotFoundError("Team invitation");
  const people = await projectPersonas(invite.project.slug);
  return { invite, actor: people[invite.role === "REVIEWER" ? "rao" : "arjun"] };
}
