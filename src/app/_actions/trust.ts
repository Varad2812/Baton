"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { errorResult, okResult, type ActionResult } from "@/lib/action-result";
import { recheckQuotes as recheckFn, runLeakageTest as leakFn } from "@/lib/handover/service";
import { actionContext } from "@/lib/server/action-context";

const Input = z.object({ slug: z.string() });

export async function recheckQuotes(input: z.input<typeof Input>): Promise<ActionResult> {
  try {
    const v = Input.parse(input);
    const { actor, project } = await actionContext(v.slug, "edit_claims");
    const r = await recheckFn(actor, project.id);
    refresh();
    return okResult(`${r.valid}/${r.checked} quotes string-matched in their cited chunk. ${r.changed} changed, ${r.regraded} claims re-graded.`);
  } catch (e) {
    return errorResult(e);
  }
}

export async function runLeakageTest(input: z.input<typeof Input>): Promise<ActionResult> {
  try {
    const v = Input.parse(input);
    const { actor, project } = await actionContext(v.slug);
    const r = await leakFn(actor, project.id);
    refresh();
    const canaries = r.results.reduce((n, x) => n + x.canariesChecked, 0);
    return r.ok
      ? okResult(`0 hits for ${r.results.length} roles (${canaries} forbidden strings checked across draft, writer input and stored views).`)
      : { ok: false, message: `${r.totalHits} leak${r.totalHits === 1 ? "" : "s"} found. See the leakage table.` };
  } catch (e) {
    return errorResult(e);
  }
}
