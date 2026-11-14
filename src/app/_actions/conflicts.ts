"use server";

// PLACEHOLDER: connect after merging the "pipeline" branch.
import { z } from "zod";
import { assertCan, getActor } from "@/lib/authz";
import { errorResult, pendingResult, type ActionResult } from "@/lib/action-result";

export async function resolveConflict(input: { conflictId: string; resolution: "A" | "B" | "BOTH" | "ASKED"; note?: string }): Promise<ActionResult> {
  try {
    z.object({ conflictId: z.string().min(1), resolution: z.enum(["A", "B", "BOTH", "ASKED"]), note: z.string().max(500).optional() }).parse(input);
    assertCan(await getActor(), "resolve_conflicts");
    return pendingResult("Resolving a conflict");
  } catch (e) {
    return errorResult(e);
  }
}
