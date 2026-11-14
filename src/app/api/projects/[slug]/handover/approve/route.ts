import { getActor } from "@/lib/authz";
import { handle, projectBySlug } from "@/lib/http";
import { approveVersion } from "@/lib/handover/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string }> };

/** Approve the current draft as a new immutable version + 4 role views (REVIEWER). Body: { note? } */
export async function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { slug } = await params;
    const project = await projectBySlug(slug);
    const actor = await getActor();
    return approveVersion(actor, project.id, await req.json().catch(() => ({})));
  });
}
