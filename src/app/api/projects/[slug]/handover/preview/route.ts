import { getActor } from "@/lib/authz";
import { handle, projectBySlug } from "@/lib/http";
import { previewRoleView } from "@/lib/handover/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string }> };

/** Live preview of the current draft for the viewer's role (template writer, not stored). */
export async function GET(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { slug } = await params;
    const project = await projectBySlug(slug);
    const actor = await getActor();
    return previewRoleView(actor, project.id);
  });
}
