"use server";

// PLACEHOLDER: connect after merging the "pipeline" branch.
import { z } from "zod";
import { assertCan, getActor } from "@/lib/authz";
import { errorResult, pendingResult, type ActionResult } from "@/lib/action-result";

export async function approveVersion(input: { handoverId: string; note?: string }): Promise<ActionResult> {
  try {
    z.object({ handoverId: z.string().min(1), note: z.string().max(1000).optional() }).parse(input);
    assertCan(await getActor(), "approve_version");
    return pendingResult("Approving a version");
  } catch (e) {
    return errorResult(e);
  }
}
