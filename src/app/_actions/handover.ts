"use server";

// PLACEHOLDERS: connect after merging the "pipeline" branch.
import { z } from "zod";
import { assertCan, getActor } from "@/lib/authz";
import { errorResult, pendingResult, type ActionResult } from "@/lib/action-result";

export async function acknowledgeSection(input: { handoverId: string; section: string }): Promise<ActionResult> {
  try {
    z.object({ handoverId: z.string().min(1), section: z.string().min(1).max(100) }).parse(input);
    assertCan(await getActor(), "acknowledge");
    return pendingResult("Acknowledging a section");
  } catch (e) {
    return errorResult(e);
  }
}

export async function askFollowUp(input: { handoverId: string; question: string; claimId?: string; section?: string }): Promise<ActionResult> {
  try {
    z.object({
      handoverId: z.string().min(1),
      question: z.string().trim().min(5).max(1000),
      claimId: z.string().optional(),
      section: z.string().max(100).optional(),
    }).parse(input);
    assertCan(await getActor(), "ask_followups");
    return pendingResult("Asking a follow-up");
  } catch (e) {
    return errorResult(e);
  }
}

export async function answerFollowUp(input: { followUpId: string; answer: string }): Promise<ActionResult> {
  try {
    z.object({ followUpId: z.string().min(1), answer: z.string().trim().min(3).max(2000) }).parse(input);
    assertCan(await getActor(), "answer_followups");
    return pendingResult("Answering a follow-up");
  } catch (e) {
    return errorResult(e);
  }
}
