import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyGithubSignature } from "./webhook";

describe("GitHub webhook signature", () => {
  const body = JSON.stringify({ repository: { full_name: "octo/repo" } });
  const sig = `sha256=${createHmac("sha256", "s3cret").update(body).digest("hex")}`;
  it("accepts the correct HMAC", () => expect(verifyGithubSignature(body, sig, "s3cret")).toBe(true));
  it("rejects a wrong secret, tampered body, missing or malformed header", () => {
    expect(verifyGithubSignature(body, sig, "other")).toBe(false);
    expect(verifyGithubSignature(`${body} `, sig, "s3cret")).toBe(false);
    expect(verifyGithubSignature(body, null, "s3cret")).toBe(false);
    expect(verifyGithubSignature(body, "sha1=abc", "s3cret")).toBe(false);
    expect(verifyGithubSignature(body, sig, "")).toBe(false);
  });
});
