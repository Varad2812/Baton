import { getActor } from "@/lib/authz";
import { handle, projectBySlug } from "@/lib/http";
import { rejectClaim } from "@/lib/handover/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string; claimId: string }> };

/** Reject a claim (OWNER, REVIEWER). Body: { note?, undo? } */
export async function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { slug, claimId } = await params;
    const project = await projectBySlug(slug);
    const actor = await getActor();
    return rejectClaim(actor, project.id, claimId, await req.json().catch(() => ({})));
  });
}
