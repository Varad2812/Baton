import { getActor } from "@/lib/authz";
import { ForbiddenError } from "@/lib/authz";
import { handle } from "@/lib/http";
import { deleteOwnProject } from "@/lib/sandbox";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string }> };

/** Delete a project you created in /new (owner, same browser). Cascades to every row of the project. */
export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { slug } = await params;
    const actor = await getActor(slug);
    const r = await deleteOwnProject(slug, actor.role);
    if (!r.deleted) throw Object.assign(new ForbiddenError(actor.role, "connect_sources"), { message: r.reason });
    return r;
  });
}
