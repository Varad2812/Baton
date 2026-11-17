// Tokens at rest: AES-256-GCM with a random 96-bit IV and the auth tag stored alongside.
// Key: ENCRYPTION_KEY (any string; hashed to 32 bytes), else derived from ADMIN_TOKEN (see serverSecret).
// Format: "v1.<iv>.<tag>.<ciphertext>" (base64url). Tampering or a wrong key throws.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { serverSecret } from "@/lib/visitor";

function key(): Buffer {
  const k = process.env.ENCRYPTION_KEY?.trim();
  return k ? createHash("sha256").update(k).digest() : serverSecret("token-encryption");
}

export function encryptSecret(plain: string, k: Buffer = key()): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptSecret(blob: string, k: Buffer = key()): string {
  const [v, iv, tag, ct] = blob.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Unknown secret format");
  const d = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
}
