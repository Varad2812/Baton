import { describe, expect, it } from "vitest";
import { gradeAll, gradeClaim, inferIsInference, lookupFrom } from "./grade";
import { chunk, claim, ev, src } from "./test-helpers";

const sources = [
  src("s_pr84", { kind: "GITHUB_PR", title: "PR #84 · Move auth to Supabase", authoritative: true }),
  src("s_dev", { kind: "CHAT", title: "Discord #dev · FestFlow", access: "TEAM" }),
  src("s_readme", { kind: "DOC", title: "README.md", access: "PUBLIC" }),
  src("s_budget", { kind: "DOC", title: "Budget sheet", access: "RESTRICTED" }),
  src("s_issue", { kind: "GITHUB_ISSUE", title: "Issue #31 · Build fails on Windows" }),
];
const chunks = [
  chunk("c_pr84", "s_pr84", "x"),
  chunk("c_dev1", "s_dev", "x", { timestamp: "2026-03-12T08:00:00.000Z" }),
  chunk("c_dev2", "s_dev", "x", { timestamp: "2026-03-13T08:00:00.000Z" }),
  chunk("c_readme", "s_readme", "x", { access: "PUBLIC" }),
  chunk("c_budget", "s_budget", "x", { access: "RESTRICTED" }),
  chunk("c_issue", "s_issue", "x"),
];
const look = lookupFrom(chunks, sources);

describe("gradeClaim", () => {
  it("VERIFIED with >= 2 distinct sources", () => {
    const g = gradeClaim(claim("a", { evidence: [ev("c_dev1"), ev("c_readme")] }), look);
    expect(g.grade).toBe("VERIFIED");
    expect(g.gradeReason).toBe("2 independent sources: #dev 12-Mar, README.md");
  });

  it("two quotes from the SAME source are still one source", () => {
    const g = gradeClaim(claim("a", { evidence: [ev("c_dev1"), ev("c_dev2")] }), look);
    expect(g.grade).toBe("SINGLE_SOURCE");
    expect(g.gradeReason).toBe("1 source: #dev 12-Mar");
  });

  it("VERIFIED with one authoritative source (merged PR / approved notes)", () => {
    const g = gradeClaim(claim("a", { evidence: [ev("c_pr84")] }), look);
    expect(g.grade).toBe("VERIFIED");
    expect(g.gradeReason).toBe("Authoritative source: PR #84");
  });

  it("SINGLE_SOURCE with exactly one non-authoritative source", () => {
    expect(gradeClaim(claim("a", { evidence: [ev("c_issue")] }), look).grade).toBe("SINGLE_SOURCE");
  });

  it("ignores invalid quotes and CONTRADICTS evidence when counting support", () => {
    const g = gradeClaim(
      claim("a", {
        evidence: [ev("c_dev1"), ev("c_readme", "q1234567", { quoteValid: false }), ev("c_issue", "q1234567", { relation: "CONTRADICTS" })],
      }),
      look,
    );
    expect(g.grade).toBe("SINGLE_SOURCE");
  });

  it("INFERRED whenever the model marked an inference, even with quotes", () => {
    const g = gradeClaim(claim("a", { isInference: true, evidence: [ev("c_dev1"), ev("c_readme")] }), look);
    expect(g.grade).toBe("INFERRED");
    expect(g.gradeReason).toMatch(/^Inferred from #dev 12-Mar, README.md/);
    expect(inferIsInference(g)).toBe(true);
  });

  it("MISSING with no evidence and no inference, keeping a checklist reason", () => {
    const g = gradeClaim(claim("gap", { grade: "MISSING", gradeReason: "Checklist: credentials. 0 records", evidence: [] }), look);
    expect(g).toMatchObject({ grade: "MISSING", gradeReason: "Checklist: credentials. 0 records" });
  });

  it("access is the max of the evidence chunks", () => {
    expect(gradeClaim(claim("a", { evidence: [ev("c_readme")] }), look).access).toBe("PUBLIC");
    expect(gradeClaim(claim("a", { evidence: [ev("c_readme"), ev("c_budget")] }), look).access).toBe("RESTRICTED");
  });
});

describe("gradeAll", () => {
  it("CONFLICTING only while the conflict is OPEN; SUPERSEDES never conflicts", () => {
    const a = claim("razorpay", { evidence: [ev("c_pr84")] });
    const b = claim("phonepe", { evidence: [ev("c_dev1")] });
    const open = gradeAll([a, b], [{ id: "cf", topicKey: "pay", claimAId: "razorpay", claimBId: "phonepe", kind: "CONTRADICTS", status: "OPEN", resolution: null, note: null }], look);
    expect(open.map((c) => c.grade)).toEqual(["CONFLICTING", "CONFLICTING"]);
    expect(open[0].gradeReason).toContain("#dev 12-Mar contradicts PR #84");

    const resolved = gradeAll([a, b], [{ id: "cf", topicKey: "pay", claimAId: "razorpay", claimBId: "phonepe", kind: "CONTRADICTS", status: "RESOLVED", resolution: "A", note: null }], look);
    expect(resolved.map((c) => c.grade)).toEqual(["VERIFIED", "SINGLE_SOURCE"]);

    const sup = gradeAll([a, b], [{ id: "cf", topicKey: "pay", claimAId: "razorpay", claimBId: "phonepe", kind: "SUPERSEDES", status: "RESOLVED", resolution: "B", note: null }], look);
    expect(sup.map((c) => c.grade)).toEqual(["VERIFIED", "SINGLE_SOURCE"]);
  });
});
