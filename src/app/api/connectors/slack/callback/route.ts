import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { writeAudit } from "@/lib/authz";
import { encryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { checkState, NONCE_COOKIE, redirectUri } from "@/lib/connectors/slack/oauth";
import { getVisitorId } from "@/lib/visitor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type OAuthResponse = { ok: boolean; error?: string; access_token?: string; scope?: string; bot_user_id?: string; team?: { id: string; name: string } };

/** Slack redirects here after consent. Verifies state + nonce, exchanges the code, stores the token encrypted. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const vid = await getVisitorId();
  const jar = await cookies();
  const check = checkState(url.searchParams.get("state"), jar.get(NONCE_COOKIE)?.value, vid);
  const home = (slug: string | null, q: Record<string, string>) => {
    const to = new URL(slug ? `/p/${slug}/sources/add?method=slack` : "/", req.url);
    for (const [k, v] of Object.entries(q)) to.searchParams.set(k, v);
    const res = NextResponse.redirect(to);
    res.cookies.delete({ name: NONCE_COOKIE, path: "/api/connectors/slack" });
    return res;
  };
  if (!check.ok) return home(null, { slack: "error", reason: check.reason });
  if (url.searchParams.get("error")) return home(check.slug, { slack: "error", reason: "Slack sign-in was cancelled." });
  const code = url.searchParams.get("code");
  if (!code) return home(check.slug, { slack: "error", reason: "Slack did not return an authorization code. Try again." });

  let j: OAuthResponse;
  try {
    const res = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: process.env.SLACK_CLIENT_ID ?? "", client_secret: process.env.SLACK_CLIENT_SECRET ?? "", code, redirect_uri: redirectUri() }),
      signal: AbortSignal.timeout(15_000),
    });
    j = (await res.json()) as OAuthResponse;
  } catch {
    return home(check.slug, { slack: "error", reason: "Could not reach Slack to finish sign-in. Try again." });
  }
  if (!j.ok || !j.access_token || !j.team) return home(check.slug, { slack: "error", reason: `Slack refused the sign-in (${j.error ?? "unknown error"}).` });

  const teamUrl = await fetch("https://slack.com/api/auth.test", { headers: { Authorization: `Bearer ${j.access_token}` }, signal: AbortSignal.timeout(10_000) })
    .then((r) => r.json() as Promise<{ url?: string }>)
    .then((x) => x.url ?? null)
    .catch(() => null);
  const project = await prisma.project.findUnique({ where: { slug: check.slug }, select: { id: true } });
  const conn = await prisma.connection.upsert({
    where: { visitorId_provider_teamId: { visitorId: vid!, provider: "slack", teamId: j.team.id } },
    create: { visitorId: vid!, projectId: project?.id ?? null, provider: "slack", teamId: j.team.id, teamName: j.team.name, teamUrl, tokenEnc: encryptSecret(j.access_token), scopes: j.scope ?? "", botUserId: j.bot_user_id ?? null },
    update: { projectId: project?.id ?? null, teamName: j.team.name, teamUrl, tokenEnc: encryptSecret(j.access_token), scopes: j.scope ?? "", botUserId: j.bot_user_id ?? null, revokedAt: null },
  });
  if (project) {
    await writeAudit(prisma, { projectId: project.id, actor: { name: "Slack OAuth", role: "SYSTEM" }, action: "connector.slack.connected", targetType: "Connection", targetId: conn.id, meta: { team: j.team.name, scopes: j.scope ?? "" } });
  }
  return home(check.slug, { slack: "connected", team: j.team.name });
}
