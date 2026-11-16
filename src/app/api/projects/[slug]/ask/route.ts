import { getActor } from "@/lib/authz";
import { assistantBudget } from "@/lib/assistant/limits";
import { askHandover, AskInput } from "@/lib/ask/service";
import { errorResponse, projectBySlug, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string }> };

/** Ask the handover: a cited answer from the approved handover the viewer may see, or a refusal. */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { slug } = await params;
    const project = await projectBySlug(slug);
    const actor = await getActor(slug);
    const input = await readJson(req, AskInput);
    const budget = await assistantBudget("ask");
    if (budget.retryAfter) {
      return Response.json(
        { ok: false, error: `Too many questions from this network. Try again in ${Math.ceil(budget.retryAfter / 60)} min.` },
        { status: 429, headers: { "Retry-After": String(budget.retryAfter) } },
      );
    }
    const answer = await askHandover(actor, project.id, input, { offlineOnly: budget.offlineOnly });
    return Response.json({ ok: true, answer, limited: budget.offlineOnly });
  } catch (e) {
    return errorResponse(e);
  }
}
