import { getActor } from "@/lib/authz";
import { handle, projectBySlug } from "@/lib/http";
import { trustReport } from "@/lib/pipeline/trust";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string }> };

/** Trust report: quote validity, grades, redactions, accuracy vs ground truth, live-run metrics, audit log. */
export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { slug } = await params;
    const project = await projectBySlug(slug);
    return trustReport(await getActor(), project.id, project.slug);
  });
}
