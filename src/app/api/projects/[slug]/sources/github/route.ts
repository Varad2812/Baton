import { getActor } from "@/lib/authz";
import { handle, projectBySlug } from "@/lib/http";
import { importGithub } from "@/lib/pipeline/sources";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

type Ctx = { params: Promise<{ slug: string }> };

/** Import a GitHub repo (OWNER). Body: { url: "owner/repo" | "https://github.com/owner/repo", access? } */
export async function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { slug } = await params;
    const project = await projectBySlug(slug);
    const actor = await getActor();
    return importGithub(actor, project.id, await req.json().catch(() => ({})));
  }, { status: 201 });
}
