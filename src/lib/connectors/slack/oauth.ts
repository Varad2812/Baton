// Slack OAuth v2 + request signing (server only).
//   state  = base64url(JSON {n, s, v, e}) + "." + HMAC: nonce (also in an httpOnly cookie, CSRF),
//            project slug, visitor id and expiry (10 min). The callback checks all four.
//   events = Slack's v0 signature: HMAC-SHA256("v0:<ts>:<body>", SLACK_SIGNING_SECRET), 5-minute window.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { serverSecret } from "@/lib/visitor";

export const SLACK_SCOPES = ["channels:read", "channels:history", "groups:read", "groups:history", "users:read"];
export const NONCE_COOKIE = "baton_slack_nonce";
const STATE_TTL_MS = 10 * 60_000;

const sign = (payload: string) => createHmac("sha256", serverSecret("slack-oauth")).update(payload).digest("base64url");
const eq = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export function redirectUri(): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000").replace(/\/$/, "");
  return `${base}/api/connectors/slack/callback`;
}

export function makeState(slug: string, visitorId: string, now = Date.now()): { state: string; nonce: string } {
  const nonce = randomBytes(16).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ n: nonce, s: slug, v: visitorId, e: now + STATE_TTL_MS })).toString("base64url");
  return { state: `${payload}.${sign(payload)}`, nonce };
}

export type StateCheck = { ok: true; slug: string } | { ok: false; reason: string };

export function checkState(state: string | null, nonceCookie: string | undefined, visitorId: string | null, now = Date.now()): StateCheck {
  if (!state || !state.includes(".")) return { ok: false, reason: "The Slack sign-in link is incomplete. Start again from Sources." };
  const [payload, mac] = state.split(".");
  if (!eq(sign(payload), mac)) return { ok: false, reason: "The Slack sign-in link was changed. Start again from Sources." };
  let p: { n: string; s: string; v: string; e: number };
  try {
    p = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "The Slack sign-in link is unreadable. Start again from Sources." };
  }
  if (p.e < now) return { ok: false, reason: "The Slack sign-in took longer than 10 minutes. Start again from Sources." };
  if (!nonceCookie || !eq(p.n, nonceCookie)) return { ok: false, reason: "This Slack sign-in was started in another browser or tab. Start again from Sources." };
  if (!visitorId || p.v !== visitorId) return { ok: false, reason: "This Slack sign-in belongs to another browser session. Start again from Sources." };
  return { ok: true, slug: p.s };
}

export function verifySlackSignature(body: string, timestamp: string | null, signature: string | null, secret: string, now = Date.now()): boolean {
  if (!secret || !timestamp || !signature?.startsWith("v0=")) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > 300) return false;
  const want = `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:${body}`).digest("hex")}`;
  return eq(want, signature);
}
