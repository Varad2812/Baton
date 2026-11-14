"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { errorResult, okResult, type ActionResult } from "@/lib/action-result";
import { GRADE_LABEL } from "@/lib/views/format";
import { answerGapQuestion as answerFn } from "@/lib/pipeline/testimony";
import { actionContext } from "@/lib/server/action-context";

const Input = z.object({
  slug: z.string(),
  questionId: z.string().min(1),
  answer: z.string().trim().min(10, "Write at least 10 characters").max(4000),
});

export async function answerGapQuestion(input: z.input<typeof Input>): Promise<ActionResult> {
  try {
    const v = Input.parse(input);
    const { actor, project } = await actionContext(v.slug, "answer_interview");
    const r = await answerFn(actor, project.id, v.questionId, { answer: v.answer });
    refresh();
    const change =
      r.gradeBefore && r.gradeBefore !== r.claim.grade
        ? `${GRADE_LABEL[r.gradeBefore]} → ${GRADE_LABEL[r.claim.grade]}`
        : GRADE_LABEL[r.claim.grade];
    const settled = r.conflict?.settlement && r.conflict.settlement !== "UNCLEAR" ? " The conflict is settled." : "";
    const red = r.redactions ? ` ${r.redactions} sensitive value${r.redactions === 1 ? "" : "s"} redacted.` : "";
    return okResult(`Saved as testimony. "${r.claim.title}": ${change}.${settled}${red}`);
  } catch (e) {
    return errorResult(e);
  }
}
