import { getActor } from "@/lib/authz";
import { ImportInput, importSlack } from "@/lib/connectors/slack/service";
import { handle, projectBySlug, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

type Ctx = { params: Promise<{ slug: string }> };

/** Import picked channels (history, capped and paginated); re-importing adds only new messages. Owner only. */
export async function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { slug } = await params;
    const project = await projectBySlug(slug);
    const actor = await getActor(project.slug);
    const input = await readJson(req, ImportInput);
    const r = await importSlack(actor, project, input);
    return { team: r.team, imported: r.imported, skipped: r.skipped, peopleMatched: r.peopleMatched, newItems: r.result?.ingest.newItems ?? 0, newFacts: r.result?.newFacts.length ?? 0 };
  });
}
