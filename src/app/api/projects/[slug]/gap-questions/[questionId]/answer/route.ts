import { getActor } from "@/lib/authz";
import { handle, projectBySlug } from "@/lib/http";
import { answerGapQuestion } from "@/lib/pipeline/testimony";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string; questionId: string }> };

/** Answer a gap-interview question (OWNER). Body: { answer } -> testimony source, claim, re-grade. */
export async function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { slug, questionId } = await params;
    const project = await projectBySlug(slug);
    const actor = await getActor();
    return answerGapQuestion(actor, project.id, questionId, await req.json().catch(() => ({})));
  });
}
