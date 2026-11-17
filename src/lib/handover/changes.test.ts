import { describe, expect, it } from "vitest";
import type { SnapshotClaim } from "./compile";
import { changeSummary, classifyChanges, visibleTo } from "./changes";

const claim = (id: string, sources: string[] = ["s1"], access: "PUBLIC" | "TEAM" | "RESTRICTED" = "TEAM"): SnapshotClaim => ({
  id,
  type: "DECISION",
  section: "Decisions",
  title: `Fact ${id}`,
  statement: "",
  topicKey: id,
  grade: "SINGLE_SOURCE",
  gradeReason: "",
  status: "APPROVED",
  access,
  fromTestimony: false,
  owner: null,
  date: null,
  reviewerNote: null,
  evidence: sources.map((s) => ({ chunkId: `c_${s}`, sourceId: s, sourceTitle: s, sourceKind: "CHAT", access, locator: "", quote: "q", relation: "SUPPORTS" as const })),
});
const cf = (id: string, a: string, b: string, kind: "CONTRADICTS" | "SUPERSEDES", status = kind === "CONTRADICTS" ? "OPEN" : "RESOLVED") => ({ id, topicKey: "t", claimAId: a, claimBId: b, kind, status, resolution: null, note: null });

describe("classifyChanges", () => {
  const v1 = { claims: [claim("price"), claim("close"), claim("csv"), claim("risk")], conflicts: [] };
  const now = {
    claims: [claim("price"), claim("close"), claim("csv", ["s1", "s2"]), claim("risk"), claim("price349"), claim("extend"), claim("brandnew")],
    conflicts: [cf("cf1", "price", "price349", "CONTRADICTS"), cf("cf2", "close", "extend", "SUPERSEDES")],
  };
  const c = classifyChanges(v1, now, 1);

  it("finds new, contradicted, outdated and newly confirmed facts", () => {
    expect(c.newFacts.map((x) => x.id).sort()).toEqual(["brandnew", "extend", "price349"]);
    expect(c.contradicted).toEqual([{ claim: expect.objectContaining({ id: "price" }), by: expect.objectContaining({ id: "price349" }) }]);
    expect(c.outdated).toEqual([{ claim: expect.objectContaining({ id: "close" }), by: expect.objectContaining({ id: "extend" }) }]);
    expect(c.confirmed.map((x) => x.id)).toEqual(["csv"]);
    expect(c.total).toBe(6);
    expect(changeSummary(c)).toBe("3 new facts, 1 contradiction, 1 outdated fact, 1 newly confirmed");
  });

  it("ignores conflicts that already existed at approval", () => {
    const again = classifyChanges({ ...now, conflicts: now.conflicts }, now, 2);
    expect(again.total).toBe(0);
    expect(changeSummary(again)).toBe("");
  });

  it("is filtered to what the viewer may see", () => {
    const secret = { claims: [...now.claims, claim("sponsor", ["budget"], "RESTRICTED")], conflicts: now.conflicts };
    const observer = { role: "OBSERVER" as const, levels: ["PUBLIC" as const], grantedSourceIds: [] };
    const owner = { role: "OWNER" as const, levels: ["PUBLIC" as const, "TEAM" as const, "RESTRICTED" as const], grantedSourceIds: [] };
    expect(classifyChanges(visibleTo(owner, v1), visibleTo(owner, secret), 1).newFacts.map((x) => x.id)).toContain("sponsor");
    expect(classifyChanges(visibleTo(observer, v1), visibleTo(observer, secret), 1).total).toBe(0);
  });
});
