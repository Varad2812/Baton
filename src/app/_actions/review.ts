"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { errorResult, okResult, type ActionResult } from "@/lib/action-result";
import { approveVersion as approveFn, markSectionReviewed as markFn } from "@/lib/handover/service";
import { actionContext } from "@/lib/server/action-context";

const ApproveInput = z.object({
  slug: z.string(),
  note: z.string().trim().max(1000).optional(),
  override: z.boolean().optional(),
  expectedVersion: z.number().int().min(1).optional(),
});

export async function approveVersion(input: z.input<typeof ApproveInput>): Promise<ActionResult<{ number: number }>> {
  try {
    const v = ApproveInput.parse(input);
    const { actor, project } = await actionContext(v.slug, "approve_version");
    const r = await approveFn(actor, project.id, { note: v.note || undefined, override: v.override, expectedVersion: v.expectedVersion });
    refresh();
    const hidden = r.views.map((x) => `${x.role.toLowerCase()} ${x.hiddenCount} hidden`).join(", ");
    const hits = r.views.reduce((n, x) => n + x.canaryHits, 0);
    return okResult(`v${r.version.number} approved and frozen. Role views: ${hidden}. Canary hits: ${hits}.`, { number: r.version.number });
  } catch (e) {
    return errorResult(e);
  }
}

const ReviewedInput = z.object({ slug: z.string(), section: z.string().trim().min(2).max(60), reviewed: z.boolean() });

export async function markSectionReviewed(input: z.input<typeof ReviewedInput>): Promise<ActionResult> {
  try {
    const v = ReviewedInput.parse(input);
    const { actor, project } = await actionContext(v.slug, "edit_claims");
    await markFn(actor, project.id, { section: v.section, reviewed: v.reviewed });
    refresh();
    return okResult(v.reviewed ? `"${v.section}" marked reviewed.` : `"${v.section}" marked not reviewed.`);
  } catch (e) {
    return errorResult(e);
  }
}
