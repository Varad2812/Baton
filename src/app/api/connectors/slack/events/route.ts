import { prisma } from "@/lib/db";
import { verifySlackSignature } from "@/lib/connectors/slack/oauth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Slack Events API endpoint (optional). Verifies the request signature with SLACK_SIGNING_SECRET,
 * answers the URL verification challenge, and marks connections revoked when the app is uninstalled.
 */
export async function POST(req: Request) {
  const secret = process.env.SLACK_SIGNING_SECRET?.trim();
  if (!secret) return Response.json({ ok: false, error: "Slack signing secret is not configured." }, { status: 503 });
  const body = await req.text();
  if (!verifySlackSignature(body, req.headers.get("x-slack-request-timestamp"), req.headers.get("x-slack-signature"), secret)) {
    return Response.json({ ok: false, error: "Invalid signature." }, { status: 401 });
  }
  let e: { type?: string; challenge?: string; team_id?: string; event?: { type?: string } };
  try {
    e = JSON.parse(body);
  } catch {
    return Response.json({ ok: false, error: "Body must be JSON." }, { status: 400 });
  }
  if (e.type === "url_verification") return Response.json({ challenge: e.challenge });
  if (e.event?.type === "app_uninstalled" || e.event?.type === "tokens_revoked") {
    await prisma.connection.updateMany({ where: { provider: "slack", teamId: e.team_id ?? "-" }, data: { revokedAt: new Date() } });
  }
  return Response.json({ ok: true });
}
