import { getActor } from "@/lib/authz";
import { handle } from "@/lib/http";
import { createProject } from "@/lib/pipeline/sources";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Create a project (OWNER). Body: { name, description? } */
export async function POST(req: Request) {
  return handle(async () => {
    const actor = await getActor();
    const body = await req.json().catch(() => ({}));
    const { project, handoverId } = await createProject(actor, body);
    return { project: { id: project.id, slug: project.slug, name: project.name }, handoverId };
  }, { status: 201 });
}
