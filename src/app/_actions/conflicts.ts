"use server";

import { refresh } from "next/cache";
import { projectPersonas } from "@/lib/authz";
import { z } from "zod";
import { errorResult, okResult, type ActionResult } from "@/lib/action-result";
import { resolveConflict as resolveConflictFn } from "@/lib/handover/service";
import { actionContext } from "@/lib/server/action-context";

const Input = z.object({
  slug: z.string(),
  conflictId: z.string().min(1),
  resolution: z.enum(["A", "B", "BOTH", "ASKED"]),
  note: z.string().trim().max(500).optional(),
});

export async function resolveConflict(input: z.input<typeof Input>): Promise<ActionResult<{ questionId: string | null }>> {
  try {
    const v = Input.parse(input);
    const { actor, project } = await actionContext(v.slug, "resolve_conflicts");
    const r = await resolveConflictFn(actor, project.id, v.conflictId, { resolution: v.resolution, note: v.note || undefined });
    refresh();
    const regraded = r.regraded.length;
    const tail = regraded ? ` ${regraded} claim${regraded === 1 ? "" : "s"} re-graded.` : "";
    const ppl = await projectPersonas(v.slug); const first = (k: "meera" | "arjun" | "rao") => ppl[k].name.split(" ")[0];
    const message =
      v.resolution === "ASKED"
        ? `Question queued for ${first("meera")} in the gap interview. The conflict stays open until it is answered.`
        : v.resolution === "BOTH"
          ? `Both claims stand; conflict resolved.${tail}`
          : `Kept "${r.winner}"; "${r.loser}" rejected.${tail}`;
    return okResult(message, { questionId: r.questionId });
  } catch (e) {
    return errorResult(e);
  }
}
