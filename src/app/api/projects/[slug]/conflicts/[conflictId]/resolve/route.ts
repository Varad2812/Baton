import { getActor } from "@/lib/authz";
import { handle, projectBySlug } from "@/lib/http";
import { resolveConflict } from "@/lib/handover/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string; conflictId: string }> };

/** Resolve a conflict (OWNER, REVIEWER). Body: { resolution: A|B|BOTH|ASKED, note? } */
export async function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { slug, conflictId } = await params;
    const project = await projectBySlug(slug);
    const actor = await getActor(slug);
    return resolveConflict(actor, project.id, conflictId, await req.json().catch(() => ({})));
  });
}
