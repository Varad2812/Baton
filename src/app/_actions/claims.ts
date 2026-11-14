"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { errorResult, okResult, type ActionResult } from "@/lib/action-result";
import { editClaim as editClaimFn, rejectClaim as rejectClaimFn, requestAccess as requestAccessFn } from "@/lib/handover/service";
import { actionContext } from "@/lib/server/action-context";

const EditInput = z
  .object({
    slug: z.string(),
    claimId: z.string().min(1),
    title: z.string().trim().min(3).max(160).optional(),
    statement: z.string().trim().min(5).max(2000).optional(),
    note: z.string().trim().max(1000).optional(),
  })
  .refine((v) => v.title || v.statement || v.note !== undefined, { message: "Nothing to change" });

export async function editClaim(input: z.input<typeof EditInput>): Promise<ActionResult> {
  try {
    const v = EditInput.parse(input);
    const { actor, project } = await actionContext(v.slug, "edit_claims");
    await editClaimFn(actor, project.id, v.claimId, {
      title: v.title,
      statement: v.statement,
      reviewerNote: v.note === undefined ? undefined : v.note || null,
    });
    refresh();
    return okResult("Claim edited. The original quotes stay attached; the change is in the audit log.");
  } catch (e) {
    return errorResult(e);
  }
}

const RejectInput = z.object({
  slug: z.string(),
  claimId: z.string().min(1),
  reason: z.string().trim().max(500).optional(),
  undo: z.boolean().optional(),
});

export async function rejectClaim(input: z.input<typeof RejectInput>): Promise<ActionResult> {
  try {
    const v = RejectInput.parse(input);
    if (!v.undo && (v.reason ?? "").length < 3) throw new z.ZodError([{ code: "custom", path: ["reason"], message: "Give a reason (at least 3 characters)", input: v.reason }]);
    const { actor, project } = await actionContext(v.slug, "reject_claims");
    await rejectClaimFn(actor, project.id, v.claimId, { note: v.reason || undefined, undo: v.undo });
    refresh();
    return okResult(v.undo ? "Claim restored to the draft." : "Claim rejected. It is excluded from every compiled handover.");
  } catch (e) {
    return errorResult(e);
  }
}

const AccessInput = z.object({
  slug: z.string(),
  section: z.string().trim().max(60).optional(),
  reason: z.string().trim().max(500).optional(),
});

export async function requestAccess(input: z.input<typeof AccessInput>): Promise<ActionResult> {
  try {
    const v = AccessInput.parse(input);
    const { actor, project } = await actionContext(v.slug, "ask_followups");
    await requestAccessFn(actor, project.id, {
      section: v.section && v.section.length >= 2 ? v.section : undefined,
      reason: v.reason && v.reason.length >= 3 ? v.reason : `Access to hidden claims${v.section ? ` in "${v.section}"` : ""}`,
    });
    refresh();
    return okResult("Request sent to Meera (owner). It is recorded in the audit log; nothing hidden is revealed until she grants the source.");
  } catch (e) {
    return errorResult(e);
  }
}
