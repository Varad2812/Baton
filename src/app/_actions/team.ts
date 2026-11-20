"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { issueInvitation, ownedTeam, redeemInvitation, teamSession } from "@/lib/team";
import { acknowledgeSection, approveVersion } from "@/lib/handover/service";
import { errorResult } from "@/lib/action-result";

export type TeamResult = { message: string; link?: string };

export async function manageTeam(slug: string, _: TeamResult, form: FormData): Promise<TeamResult> {
  try {
    if (form.get("intent") === "revoke") {
      const p = await ownedTeam(slug);
      await prisma.teamInvite.updateMany({ where: { id: String(form.get("id")), projectId: p.id, revokedAt: null }, data: { revokedAt: new Date() } });
      refresh();
      return { message: "Invitation revoked." };
    }
    const role = z.enum(["REVIEWER","INCOMING"]).parse(form.get("role"));
    const secret = await issueInvitation(slug, role);
    refresh();
    return { link: "/join/" + secret, message: "Send this link privately to the invited teammate. It can be accepted in one browser." };
  } catch (e) { return { message: errorResult(e).message }; }
}

export async function joinTeam(secret: string, _previous: TeamResult): Promise<TeamResult> {
  let id: string;
  try { id = await redeemInvitation(secret); } catch (e) { return { message: errorResult(e).message }; }
  redirect("/team/" + id);
}

export async function teamDecision(id: string, _: TeamResult, form: FormData): Promise<TeamResult> {
  try {
    const { invite, actor } = await teamSession(id);
    const version = z.coerce.number().int().positive().parse(form.get("version"));
    if (actor.role === "REVIEWER") {
      await approveVersion(actor, invite.projectId, { expectedVersion: version, override: form.get("override") === "on", note: String(form.get("note") ?? "") });
    } else {
      await acknowledgeSection(actor, invite.projectId, { version, section: "Overview" });
    }
    refresh();
    return { message: actor.role === "REVIEWER" ? "Version approved." : "Handover acknowledged." };
  } catch (e) { return { message: errorResult(e).message }; }
}
