import { getActor } from "@/lib/authz";
import { errorResponse, readJson } from "@/lib/http";
import { assistantBudget } from "@/lib/assistant/limits";
import { answerChat, ChatInput } from "@/lib/assistant/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Ask Baton chat. Nothing is stored: the conversation lives in the browser tab only. */
export async function POST(req: Request) {
  try {
    const input = await readJson(req, ChatInput);
    const budget = await assistantBudget("assistant-chat");
    if (budget.retryAfter) {
      return Response.json(
        { ok: false, error: `Too many questions from this network. Try again in ${Math.ceil(budget.retryAfter / 60)} min.` },
        { status: 429, headers: { "Retry-After": String(budget.retryAfter) } },
      );
    }
    const actor = await getActor(input.slug ?? undefined);
    const reply = await answerChat(actor, input, { offlineOnly: budget.offlineOnly });
    return Response.json({ ok: true, reply, limited: budget.offlineOnly });
  } catch (e) {
    return errorResponse(e);
  }
}
