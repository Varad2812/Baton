import { NextResponse } from "next/server";
import { assertCan, getActor } from "@/lib/authz";
import { errorResponse, projectBySlug } from "@/lib/http";
import { makeState, NONCE_COOKIE, redirectUri, SLACK_SCOPES } from "@/lib/connectors/slack/oauth";
import { slackConfig } from "@/lib/connectors/slack/service";
import { getVisitorId } from "@/lib/visitor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Start "Connect Slack": owner only; redirects to Slack's consent screen with a signed state. */
export async function GET(req: Request) {
  try {
    const slug = new URL(req.url).searchParams.get("slug") ?? "";
    const project = await projectBySlug(slug);
    const actor = await getActor(project.slug);
    assertCan(actor, "connect_sources");
    const back = new URL(`/p/${project.slug}/sources/add?method=slack`, req.url);
    if (!slackConfig().oauth) {
      back.searchParams.set("slack", "error");
      back.searchParams.set("reason", "Slack sign-in is not configured on this server. Use the demo workspace or upload a Slack export ZIP.");
      return NextResponse.redirect(back);
    }
    const vid = await getVisitorId();
    if (!vid) throw Object.assign(new Error("Cookies are blocked, so Slack sign-in cannot be verified. Allow cookies and retry."), { status: 400 });
    const { state, nonce } = makeState(project.slug, vid);
    const url = new URL("https://slack.com/oauth/v2/authorize");
    url.searchParams.set("client_id", process.env.SLACK_CLIENT_ID!.trim());
    url.searchParams.set("scope", SLACK_SCOPES.join(","));
    url.searchParams.set("redirect_uri", redirectUri());
    url.searchParams.set("state", state);
    const res = NextResponse.redirect(url);
    res.cookies.set(NONCE_COOKIE, nonce, { httpOnly: true, sameSite: "lax", secure: url.protocol === "https:", path: "/api/connectors/slack", maxAge: 600 });
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
