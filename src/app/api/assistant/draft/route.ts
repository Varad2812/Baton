import { getActor } from "@/lib/authz";
import { errorResponse, readJson } from "@/lib/http";
import { assistantBudget } from "@/lib/assistant/limits";
import { draftField, DraftInput } from "@/lib/assistant/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Draft text for one field. Never submits anything; the user inserts it and sends the form. */
export async function POST(req: Request) {
  try {
    const input = await readJson(req, DraftInput);
    const budget = await assistantBudget("assistant-draft");
    if (budget.retryAfter) {
      return Response.json(
        { ok: false, error: `Too many drafts from this network. Try again in ${Math.ceil(budget.retryAfter / 60)} min.` },
        { status: 429, headers: { "Retry-After": String(budget.retryAfter) } },
      );
    }
    const actor = await getActor(input.slug ?? undefined);
    const draft = await draftField(actor, input, { offlineOnly: budget.offlineOnly });
    return Response.json({ ok: true, draft });
  } catch (e) {
    return errorResponse(e);
  }
}
