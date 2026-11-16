import { getActor } from "@/lib/authz";
import { askOwner, AskOwnerInput } from "@/lib/ask/service";
import { handle, projectBySlug, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string }> };

/** "Ask <owner>": send a question the handover can't answer to the departing owner (successor only). */
export async function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { slug } = await params;
    const project = await projectBySlug(slug);
    const actor = await getActor(slug);
    const input = await readJson(req, AskOwnerInput);
    return askOwner(actor, project.id, input);
  });
}
