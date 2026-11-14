import { getActor } from "@/lib/authz";
import { handle, projectBySlug } from "@/lib/http";
import { labelSource } from "@/lib/pipeline/sources";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string; sourceId: string }> };

/** Relabel a source (OWNER). Body: { access?, authoritative?, grantedToIncoming? } */
export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { slug, sourceId } = await params;
    const project = await projectBySlug(slug);
    const actor = await getActor();
    return labelSource(actor, project.id, sourceId, await req.json().catch(() => ({})));
  });
}
