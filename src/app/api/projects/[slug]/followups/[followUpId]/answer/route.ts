import { getActor } from "@/lib/authz";
import { handle, projectBySlug } from "@/lib/http";
import { answerFollowUp } from "@/lib/handover/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string; followUpId: string }> };

/** Answer a follow-up (OWNER). Body: { answer } */
export async function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { slug, followUpId } = await params;
    const project = await projectBySlug(slug);
    const actor = await getActor();
    return answerFollowUp(actor, project.id, followUpId, await req.json().catch(() => ({})));
  });
}
