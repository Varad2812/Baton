import { timingSafeEqual } from "node:crypto";

/** True when the request carries ADMIN_TOKEN as a Bearer token (constant-time compare). */
export function isAdmin(req: Request): boolean {
  const want = process.env.ADMIN_TOKEN?.trim();
  if (!want) return false;
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const a = Buffer.from(got);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}
