import { getActor } from "@/lib/authz";
import { buildExport } from "@/lib/handover/export";
import { errorResponse, NotFoundError, projectBySlug } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string }> };

/** Download your role's handover: `?format=md` (Markdown) or `?format=json`. */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const { slug } = await params;
    const project = await projectBySlug(slug);
    const actor = await getActor(project.slug);
    const format = new URL(req.url).searchParams.get("format") === "json" ? "json" : "md";
    const e = await buildExport(actor, project, new URL(req.url).origin);
    if (!e) throw new NotFoundError("Handover");
    const name = `${project.slug.replace(/-[0-9a-f]{10}$/, "")}-handover-${actor.role.toLowerCase()}`;
    return format === "json"
      ? new Response(JSON.stringify(e.json, null, 2), { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="${name}.json"` } })
      : new Response(e.markdown, { headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="${name}.md"` } });
  } catch (err) {
    return errorResponse(err);
  }
}
