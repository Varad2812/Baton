import { getActor } from "@/lib/authz";
import { handle, projectBySlug } from "@/lib/http";
import { requestAccess } from "@/lib/handover/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string }> };

/** Request access to hidden content (INCOMING). Body: { section?, reason } */
export async function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { slug } = await params;
    const project = await projectBySlug(slug);
    const actor = await getActor(slug);
    return requestAccess(actor, project.id, await req.json().catch(() => ({})));
  });
}
