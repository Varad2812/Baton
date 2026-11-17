import { prisma } from "@/lib/db";
import { syncGithub } from "@/lib/sync/service";
import { verifyGithubSignature as verify } from "@/lib/sync/webhook";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EVENTS = new Set(["push", "pull_request", "pull_request_review_comment", "issues", "issue_comment"]);

/**
 * GitHub webhook: on push / PR / issue activity, run an incremental sync for every project that
 * imported that repository. Only new or changed items are fetched; reviewed facts are untouched.
 * Configure: Payload URL <app>/api/webhooks/github, content type application/json, secret = GITHUB_WEBHOOK_SECRET.
 */
export async function POST(req: Request) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET?.trim();
  if (!secret) return Response.json({ ok: false, error: "Webhook not configured (GITHUB_WEBHOOK_SECRET is not set)." }, { status: 503 });
  const body = await req.text();
  if (!verify(body, req.headers.get("x-hub-signature-256"), secret)) {
    return Response.json({ ok: false, error: "Invalid signature." }, { status: 401 });
  }
  const event = req.headers.get("x-github-event") ?? "";
  if (event === "ping") return Response.json({ ok: true, pong: true });
  if (!EVENTS.has(event)) return Response.json({ ok: true, ignored: event });
  let repo = "";
  try {
    repo = (JSON.parse(body) as { repository?: { full_name?: string } }).repository?.full_name ?? "";
  } catch {
    return Response.json({ ok: false, error: "Body must be JSON." }, { status: 400 });
  }
  const states = await prisma.syncState.findMany({ where: { provider: "github", externalKey: { equals: repo, mode: "insensitive" } }, select: { projectId: true } });
  const projects = [...new Set(states.map((s) => s.projectId))];
  // Answer GitHub within its 10 s timeout; the syncs continue in the background.
  for (const projectId of projects) {
    void syncGithub(projectId, { actor: { key: "meera", name: "GitHub webhook", role: "OWNER", roleTitle: "" }, system: true, reason: "webhook" }).catch((e) =>
      console.error(JSON.stringify({ level: "error", msg: "webhook sync failed", projectId, error: (e as Error)?.message })),
    );
  }
  return Response.json({ ok: true, event, repo, projects: projects.length }, { status: 202 });
}
