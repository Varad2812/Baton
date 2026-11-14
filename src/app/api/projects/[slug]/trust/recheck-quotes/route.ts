import { getActor } from "@/lib/authz";
import { handle, projectBySlug } from "@/lib/http";
import { recheckQuotes } from "@/lib/handover/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string }> };

/** Re-run exact quote matching on all evidence and re-grade (OWNER, REVIEWER). */
export async function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { slug } = await params;
    const project = await projectBySlug(slug);
    const actor = await getActor();
    return recheckQuotes(actor, project.id);
  });
}
