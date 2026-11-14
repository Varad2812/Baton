import { getActor } from "@/lib/authz";
import { handle, projectBySlug } from "@/lib/http";
import { createFollowUp } from "@/lib/handover/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string }> };

/** Ask a follow-up (INCOMING). Body: { claimId? , section?, question } */
export async function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { slug } = await params;
    const project = await projectBySlug(slug);
    const actor = await getActor();
    return createFollowUp(actor, project.id, await req.json().catch(() => ({})));
  });
}
