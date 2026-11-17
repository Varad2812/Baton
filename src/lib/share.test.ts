import { describe, expect, it } from "vitest";
import { signShare, SHARE_TTL_MS, verifyShare } from "./share";

describe("share links", () => {
  it("verifies its own token and rejects tampering and expiry", () => {
    const t = signShare("prj_1", 2, 1_000);
    expect(verifyShare(t, 2_000)).toMatchObject({ projectId: "prj_1", version: 2 });
    expect(verifyShare(t, 1_000 + SHARE_TTL_MS + 1)).toBeNull();
    const [payload, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ p: "prj_other", v: 2, e: 9e15 })).toString("base64url");
    expect(verifyShare(`${forged}.${sig}`, 2_000)).toBeNull();
    expect(verifyShare(`${payload}.x${sig.slice(1)}`, 2_000)).toBeNull();
    expect(verifyShare("nonsense", 2_000)).toBeNull();
  });
});
