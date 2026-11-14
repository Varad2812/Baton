"use server";

// PLACEHOLDERS: connect after merging the "pipeline" branch.
import { z } from "zod";
import { assertCan, getActor } from "@/lib/authz";
import { errorResult, pendingResult, type ActionResult } from "@/lib/action-result";

export async function editClaim(input: { claimId: string; statement: string; note?: string }): Promise<ActionResult> {
  try {
    z.object({ claimId: z.string().min(1), statement: z.string().trim().min(5).max(2000), note: z.string().max(500).optional() }).parse(input);
    assertCan(await getActor(), "edit_claims");
    return pendingResult("Editing a claim");
  } catch (e) {
    return errorResult(e);
  }
}

export async function rejectClaim(input: { claimId: string; reason: string }): Promise<ActionResult> {
  try {
    z.object({ claimId: z.string().min(1), reason: z.string().trim().min(3).max(500) }).parse(input);
    assertCan(await getActor(), "reject_claims");
    return pendingResult("Rejecting a claim");
  } catch (e) {
    return errorResult(e);
  }
}

export async function requestAccess(input: { slug: string; section?: string }): Promise<ActionResult> {
  try {
    z.object({ slug: z.string().min(1), section: z.string().max(100).optional() }).parse(input);
    await getActor();
    return pendingResult("Requesting access from the owner");
  } catch (e) {
    return errorResult(e);
  }
}
