import { getActor } from "@/lib/authz";
import { handle, projectBySlug } from "@/lib/http";
import { acknowledgeSection } from "@/lib/handover/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string }> };

/** Acknowledge a section of an approved version (INCOMING). Body: { version, section } */
export async function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { slug } = await params;
    const project = await projectBySlug(slug);
    const actor = await getActor();
    return acknowledgeSection(actor, project.id, await req.json().catch(() => ({})));
  });
}
