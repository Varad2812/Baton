import { getActor } from "@/lib/authz";
import { handle, projectBySlug } from "@/lib/http";
import { getRoleView } from "@/lib/handover/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string }> };

/** The approved view for the viewer's own role. ?version=n (default: latest). */
export async function GET(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { slug } = await params;
    const project = await projectBySlug(slug);
    const actor = await getActor();
    const v = new URL(req.url).searchParams.get("version");
    const n = v ? Number.parseInt(v, 10) : undefined;
    return getRoleView(actor, project.id, n && n > 0 ? n : undefined);
  });
}
