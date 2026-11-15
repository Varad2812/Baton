"use server";

import { refresh } from "next/cache";
import { projectPersonas } from "@/lib/authz";
import { z } from "zod";
import { errorResult, okResult, type ActionResult } from "@/lib/action-result";
import { acknowledgeSection as ackFn, answerFollowUp as answerFn, createFollowUp } from "@/lib/handover/service";
import { actionContext } from "@/lib/server/action-context";

const AckInput = z.object({ slug: z.string(), version: z.number().int().min(1), section: z.string().trim().min(2).max(60) });

export async function acknowledgeSection(input: z.input<typeof AckInput>): Promise<ActionResult> {
  try {
    const v = AckInput.parse(input);
    const { actor, project } = await actionContext(v.slug, "acknowledge");
    const r = await ackFn(actor, project.id, { version: v.version, section: v.section });
    refresh();
    return okResult(r.already ? `"${v.section}" was already acknowledged.` : `"${v.section}" acknowledged for v${v.version}. The time is on the receipt.`);
  } catch (e) {
    return errorResult(e);
  }
}

const AskInput = z
  .object({
    slug: z.string(),
    question: z.string().trim().min(5, "Write at least 5 characters").max(1000),
    claimId: z.string().min(1).optional(),
    section: z.string().trim().min(2).max(60).optional(),
  })
  .refine((v) => v.claimId || v.section, { message: "Ask about a claim or a section", path: ["section"] });

export async function askFollowUp(input: z.input<typeof AskInput>): Promise<ActionResult> {
  try {
    const v = AskInput.parse({ ...input, section: input.section || (input.claimId ? undefined : "General") });
    const { actor, project } = await actionContext(v.slug, "ask_followups");
    await createFollowUp(actor, project.id, { question: v.question, claimId: v.claimId, section: v.section });
    refresh();
    const ppl = await projectPersonas(v.slug); const first = (k: "meera" | "arjun" | "rao") => ppl[k].name.split(" ")[0];
    return okResult(`Question sent to ${first("meera")}. The answer is saved as testimony and cited like any other source.`);
  } catch (e) {
    return errorResult(e);
  }
}

const AnswerInput = z.object({ slug: z.string(), followUpId: z.string().min(1), answer: z.string().trim().min(10, "Write at least 10 characters").max(4000) });

export async function answerFollowUp(input: z.input<typeof AnswerInput>): Promise<ActionResult> {
  try {
    const v = AnswerInput.parse(input);
    const { actor, project } = await actionContext(v.slug, "answer_followups");
    const r = await answerFn(actor, project.id, v.followUpId, { answer: v.answer });
    refresh();
    const ppl = await projectPersonas(v.slug); const first = (k: "meera" | "arjun" | "rao") => ppl[k].name.split(" ")[0];
    return okResult(`Answer saved as testimony${r.claimTitle ? ` on "${r.claimTitle}"` : ""}. ${first("arjun")} sees it in the handover.`);
  } catch (e) {
    return errorResult(e);
  }
}
