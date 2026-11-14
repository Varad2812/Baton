import { getActor } from "@/lib/authz";
import { handle, projectBySlug } from "@/lib/http";
import { editClaim } from "@/lib/handover/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string; claimId: string }> };

/** Edit a claim (OWNER, REVIEWER). Body: { title?, statement?, section?, reviewerNote? } -> status EDITED. */
export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { slug, claimId } = await params;
    const project = await projectBySlug(slug);
    const actor = await getActor();
    return editClaim(actor, project.id, claimId, await req.json().catch(() => ({})));
  });
}
