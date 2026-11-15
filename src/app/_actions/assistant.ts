"use server";

import { z } from "zod";
import { getActor } from "@/lib/authz";
import { DraftUsedInput, recordDraftUsed } from "@/lib/assistant/service";

/** Audit row "assistant.draft.used" when a draft is inserted into a field (chat messages are never logged). */
export async function logDraftUsed(input: z.input<typeof DraftUsedInput>): Promise<{ ok: boolean }> {
  try {
    const v = DraftUsedInput.parse(input);
    const actor = await getActor(v.slug);
    await recordDraftUsed(actor, v);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
