import { describe, expect, it } from "vitest";
import { applyLabels, pairCandidates } from "./conflicts";
import { gradeAll, lookupFrom } from "./grade";
import { counterIds } from "./ids";
import { chunk, claim, ev, src } from "./test-helpers";

const sources = [src("s1"), src("s2")];
const chunks = [
  chunk("c1", "s1", "x", { timestamp: "2026-01-10T00:00:00.000Z" }),
  chunk("c2", "s2", "x", { timestamp: "2026-04-19T00:00:00.000Z" }),
];
const look = lookupFrom(chunks, sources);

describe("pairCandidates", () => {
  it("pairs claims that share a topicKey, older claim first", () => {
    const newer = claim("phonepe", { topicKey: "payment_gateway", date: "2026-04-19", evidence: [ev("c2")] });
    const older = claim("razorpay", { topicKey: "payment_gateway", date: "2026-04-02", evidence: [ev("c1")] });
    const other = claim("hosting", { topicKey: "hosting", evidence: [ev("c1")] });
    const pairs = pairCandidates([newer, other, older], look);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].a.id).toBe("razorpay");
    expect(pairs[0].b.id).toBe("phonepe");
  });

  it("falls back to the earliest evidence timestamp when a claim has no date", () => {
    const x = claim("x", { topicKey: "t", evidence: [ev("c2")] });
    const y = claim("y", { topicKey: "t", evidence: [ev("c1")] });
    const [p] = pairCandidates([x, y], look);
    expect([p.a.id, p.b.id]).toEqual(["y", "x"]);
  });

  it("skips MISSING, REJECTED, gap topics and claims without valid support", () => {
    const base = { topicKey: "t", evidence: [ev("c1")] };
    const pairs = pairCandidates(
      [
        claim("ok", base),
        claim("missing", { ...base, grade: "MISSING" }),
        claim("rejected", { ...base, status: "REJECTED" }),
        claim("noev", { topicKey: "t", evidence: [ev("c1", "zzzzzzzzz", { quoteValid: false })] }),
        claim("gap", { ...base, topicKey: "gap:t" }),
      ],
      look,
    );
    expect(pairs).toHaveLength(0);
  });

  it("produces all pairs within a topic, capped to the most recent claims", () => {
    const cs = Array.from({ length: 7 }, (_, i) => claim(`c${i}`, { topicKey: "t", date: `2026-01-0${i + 1}`, evidence: [ev("c1")] }));
    const pairs = pairCandidates(cs, look, 5);
    expect(pairs).toHaveLength(10); // C(5,2)
    expect(pairs.some((p) => p.a.id === "c0" || p.a.id === "c1")).toBe(false);
  });
});

describe("applyLabels", () => {
  const a = claim("firebase", { topicKey: "auth_provider", date: "2026-01-05", evidence: [ev("c1")] });
  const b = claim("supabase", { topicKey: "auth_provider", date: "2026-03-12", evidence: [ev("c2")] });
  const pairs = pairCandidates([a, b], look);

  it("CONTRADICTS -> OPEN conflict and both claims CONFLICTING", () => {
    const cfs = applyLabels(pairs, [{ pair: 0, label: "CONTRADICTS", note: "both current" }], counterIds());
    expect(cfs).toEqual([
      { id: "cf_001", topicKey: "auth_provider", claimAId: "firebase", claimBId: "supabase", kind: "CONTRADICTS", status: "OPEN", resolution: null, note: "both current" },
    ]);
    expect(gradeAll([a, b], cfs, look).map((c) => c.grade)).toEqual(["CONFLICTING", "CONFLICTING"]);
  });

  it("SUPERSEDES -> RESOLVED evolution (B wins), not a conflict", () => {
    const cfs = applyLabels(pairs, [{ pair: 0, label: "SUPERSEDES", note: "migrated 12 Mar" }], counterIds());
    expect(cfs[0]).toMatchObject({ kind: "SUPERSEDES", status: "RESOLVED", resolution: "B" });
    expect(gradeAll([a, b], cfs, look).some((c) => c.grade === "CONFLICTING")).toBe(false);
  });

  it("CONSISTENT, unknown pair indexes and duplicates produce nothing extra", () => {
    const cfs = applyLabels(
      pairs,
      [
        { pair: 0, label: "CONSISTENT", note: "" },
        { pair: 9, label: "CONTRADICTS", note: "" },
      ],
      counterIds(),
    );
    expect(cfs).toEqual([]);
    const dup = applyLabels(
      pairs,
      [
        { pair: 0, label: "CONTRADICTS", note: "" },
        { pair: 0, label: "CONTRADICTS", note: "" },
      ],
      counterIds(),
    );
    expect(dup).toHaveLength(1);
  });
});
