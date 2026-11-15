import { getActor } from "@/lib/authz";
import { handle, projectBySlug } from "@/lib/http";
import { runLeakageTest } from "@/lib/handover/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string }> };

/** Run the canary leakage test for every role (any persona; returns counts only). */
export async function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { slug } = await params;
    const project = await projectBySlug(slug);
    const actor = await getActor(slug);
    return runLeakageTest(actor, project.id);
  });
}
