"use server";

// PLACEHOLDER: connect after merging the "pipeline" branch.
import { z } from "zod";
import { assertCan, getActor } from "@/lib/authz";
import { errorResult, pendingResult, type ActionResult } from "@/lib/action-result";

export async function answerGapQuestion(input: { questionId: string; answer: string }): Promise<ActionResult> {
  try {
    z.object({ questionId: z.string().min(1), answer: z.string().trim().min(3).max(4000) }).parse(input);
    assertCan(await getActor(), "answer_interview");
    return pendingResult("Saving an interview answer as testimony");
  } catch (e) {
    return errorResult(e);
  }
}
