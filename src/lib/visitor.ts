// Anonymous visitor identity (no login). The proxy gives every browser a signed cookie
// `baton_vid` = "<id>.<hmac>" and forwards the verified id to the app as the `x-baton-vid` request
// header (overwriting anything the client sent). Sandboxes and /new projects belong to that id.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { DEMO_SLUG } from "./demo";

export const VISITOR_COOKIE = "baton_vid";
export const VISITOR_HEADER = "x-baton-vid";
export const VISITOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

/** Signing key: ENCRYPTION_KEY, else ADMIN_TOKEN, else a key derived from DATABASE_URL (local dev). */
export function serverSecret(purpose: string): Buffer {
  const base =
    process.env.ENCRYPTION_KEY?.trim() || process.env.ADMIN_TOKEN?.trim() || `baton-dev:${process.env.DATABASE_URL ?? "local"}`;
  return createHash("sha256").update(`${purpose}\u0000${base}`).digest();
}

const mac = (id: string) => createHmac("sha256", serverSecret("visitor")).update(id).digest("base64url").slice(0, 22);

export function newVisitorId(): string {
  return randomBytes(12).toString("base64url");
}

export function signVisitor(id: string): string {
  return `${id}.${mac(id)}`;
}

/** Returns the visitor id if the cookie value is well-formed and correctly signed, else null. */
export function verifyVisitor(value: string | null | undefined): string | null {
  if (!value || value.length > 80) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const id = value.slice(0, dot);
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(id)) return null;
  const a = Buffer.from(value.slice(dot + 1));
  const b = Buffer.from(mac(id));
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}

/** Short public key for a visitor (used in the sandbox slug); does not reveal the id. */
export function visitorKey(id: string): string {
  return createHash("sha256").update(`key:${id}`).digest("hex").slice(0, 10);
}

/** The visitor's private copy of the demo. */
export function sandboxSlug(id: string): string {
  return `${DEMO_SLUG}-${visitorKey(id)}`;
}

/** Current visitor id (server components, route handlers, server actions). Null outside a request. */
export async function getVisitorId(): Promise<string | null> {
  try {
    const { headers, cookies } = await import("next/headers");
    const h = (await headers()).get(VISITOR_HEADER);
    if (h && /^[A-Za-z0-9_-]{8,40}$/.test(h)) return h;
    return verifyVisitor((await cookies()).get(VISITOR_COOKIE)?.value);
  } catch {
    return null;
  }
}
