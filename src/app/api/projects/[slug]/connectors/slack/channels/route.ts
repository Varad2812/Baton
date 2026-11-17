import { getActor } from "@/lib/authz";
import { listSlackChannels, SlackRefSchema, type SlackRef } from "@/lib/connectors/slack/service";
import { handle, projectBySlug } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string }> };

/** Channels of a workspace (`?ref=demo` or `?ref=conn:<id>`), with visibility, members and whether Baton is in them. Owner only. */
export async function GET(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { slug } = await params;
    const project = await projectBySlug(slug);
    const actor = await getActor(project.slug);
    const ref = SlackRefSchema.parse(new URL(req.url).searchParams.get("ref") ?? "") as SlackRef;
    return listSlackChannels(actor, ref);
  });
}
