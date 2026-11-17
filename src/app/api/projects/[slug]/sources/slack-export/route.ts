import { getActor } from "@/lib/authz";
import { importSlackExport } from "@/lib/connectors/slack/service";
import { EXPORT_MAX_BYTES } from "@/lib/connectors/slack/export";
import { BadRequestError, handle, projectBySlug } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

type Ctx = { params: Promise<{ slug: string }> };

/** Upload the official Slack export ZIP (multipart field "file"). Owner only. */
export async function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { slug } = await params;
    const project = await projectBySlug(slug);
    const actor = await getActor(project.slug);
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new BadRequestError("Send the ZIP as multipart form data (field \"file\").");
    }
    const f = form.get("file");
    if (!f || typeof f === "string") throw new BadRequestError("Choose a Slack export .zip file.");
    if (!/\.zip$/i.test(f.name)) throw new BadRequestError(`${f.name}: not a .zip file. Upload the ZIP that Slack's export produces.`);
    if (f.size === 0) throw new BadRequestError(`${f.name}: file is empty.`);
    if (f.size > EXPORT_MAX_BYTES) throw new BadRequestError(`${f.name}: larger than 25 MB. Export a shorter date range.`);
    const r = await importSlackExport(actor, project, new Uint8Array(await f.arrayBuffer()), f.name);
    return { team: r.team, imported: r.imported, peopleMatched: r.peopleMatched, newItems: r.result?.ingest.newItems ?? 0, newFacts: r.result?.newFacts.length ?? 0 };
  });
}
