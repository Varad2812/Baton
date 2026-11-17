import { createHmac, timingSafeEqual } from "node:crypto";

/** Constant-time check of GitHub's X-Hub-Signature-256 ("sha256=<hex HMAC-SHA256 of the raw body>"). */
export function verifyGithubSignature(body: string, header: string | null, secret: string): boolean {
  if (!secret || !header?.startsWith("sha256=")) return false;
  const want = Buffer.from(`sha256=${createHmac("sha256", secret).update(body).digest("hex")}`);
  const got = Buffer.from(header);
  return want.length === got.length && timingSafeEqual(want, got);
}
