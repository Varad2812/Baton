"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { errorResult, okResult, type ActionResult } from "@/lib/action-result";
import { actOnRisk } from "@/lib/radar/load";
import { actionContext } from "@/lib/server/action-context";

const Input = z.object({ slug: z.string().min(1).max(80), itemId: z.string().min(3).max(200) });

export async function actOnRiskItem(input: z.input<typeof Input>): Promise<ActionResult> {
  try {
    const v = Input.parse(input);
    const { actor, project } = await actionContext(v.slug);
    const r = await actOnRisk(actor, project.id, v.itemId);
    refresh();
    return okResult(r.message, r);
  } catch (e) {
    return errorResult(e);
  }
}
