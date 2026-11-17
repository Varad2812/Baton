// Signed, read-only share links for an approved handover version (successor's role view).
// Token = base64url(JSON {p: projectId, v: version, e: expiry}) + "." + HMAC-SHA256. No login needed to open;
// it shows exactly what the successor's stored view of that version contains, nothing else.
import { createHmac, timingSafeEqual } from "node:crypto";
import { serverSecret } from "@/lib/visitor";

export const SHARE_TTL_MS = 7 * 24 * 60 * 60_000;
const mac = (payload: string) => createHmac("sha256", serverSecret("share")).update(payload).digest("base64url");

export function signShare(projectId: string, version: number, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ p: projectId, v: version, e: now + SHARE_TTL_MS })).toString("base64url");
  return `${payload}.${mac(payload)}`;
}

export function verifyShare(token: string, now = Date.now()): { projectId: string; version: number; expires: Date } | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const a = Buffer.from(mac(payload));
  const b = Buffer.from(sig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { p: string; v: number; e: number };
    if (typeof p.p !== "string" || !Number.isInteger(p.v) || p.e < now) return null;
    return { projectId: p.p, version: p.v, expires: new Date(p.e) };
  } catch {
    return null;
  }
}
