import { describe, expect, it } from "vitest";
import { lookupFrom } from "./grade";
import { counterIds } from "./ids";
import { buildCandidates, dependents, rankQuestions, riskWeight, toGapQuestions, type QuestionCandidate } from "./questions";
import { chunk, claim, ev, src } from "./test-helpers";

const look = lookupFrom([chunk("c1", "s1", "x"), chunk("c2", "s2", "x")], [src("s1"), src("s2")]);

describe("riskWeight", () => {
  it("weights MISSING by checklist item and other kinds by kind", () => {
    expect(riskWeight("MISSING", "credentials_owner")).toBe(8);
    expect(riskWeight("MISSING", "code_docs")).toBe(2);
    expect(riskWeight("MISSING", null)).toBe(5);
    expect(riskWeight("CONFLICT")).toBe(6);
    expect(riskWeight("SINGLE_OWNER")).toBe(4);
    expect(riskWeight("RECURRING")).toBe(3);
    expect(riskWeight("INFERRED")).toBe(2);
  });
});

describe("dependents", () => {
  it("counts other live claims sharing topic, evidence chunk or checklist key; min 1, max 9", () => {
    const t = claim("t", { topicKey: "pay", checklistKeys: ["key_decisions"], evidence: [ev("c1")] });
    const all = [
      t,
      claim("sameTopic", { topicKey: "pay" }),
      claim("sameChunk", { evidence: [ev("c1")] }),
      claim("sameKey", { checklistKeys: ["key_decisions"] }),
      claim("rejected", { topicKey: "pay", status: "REJECTED" }),
      claim("unrelated"),
    ];
    expect(dependents([t], all)).toBe(3);
    expect(dependents([claim("lonely")], all)).toBe(1);
    const many = Array.from({ length: 20 }, (_, i) => claim(`m${i}`, { topicKey: "pay" }));
    expect(dependents([t], [t, ...many])).toBe(9);
  });
});

describe("buildCandidates + rankQuestions", () => {
  it("priority = weight x dependents, highest first, at most 10, one per claim", () => {
    const missing = claim("gap_db", { grade: "MISSING", topicKey: "gap:db_password", checklistKeys: ["credentials_owner"], title: "Who holds the production database password" });
    const access = Array.from({ length: 3 }, (_, i) => claim(`acc${i}`, { checklistKeys: ["credentials_owner"], grade: "VERIFIED", evidence: [ev("c1")] }));
    const a = claim("razorpay", { topicKey: "pay", grade: "CONFLICTING", evidence: [ev("c1")] });
    const b = claim("phonepe", { topicKey: "pay", grade: "CONFLICTING", evidence: [ev("c2")] });
    const rec = claim("windows", { type: "RECURRING", evidence: [ev("c1"), ev("c2")] });
    const so = claim("email_owner", { type: "RISK", grade: "INFERRED", isInference: true });
    const inf = claim("domain", { type: "RISK", grade: "INFERRED", isInference: true });
    const all = [missing, ...access, a, b, rec, so, inf];
    const cands = buildCandidates(all, [{ id: "cf", topicKey: "pay", claimAId: "razorpay", claimBId: "phonepe", kind: "CONTRADICTS", status: "OPEN", resolution: null, note: null }], look, new Set(["email_owner"]));

    const by = Object.fromEntries(cands.map((c) => [c.relatedClaimId, c]));
    expect(by.gap_db).toMatchObject({ kind: "MISSING", weight: 8, dependents: 3, priority: 24 });
    expect(by.razorpay.kind).toBe("CONFLICT");
    expect(by.razorpay.priority).toBe(6 * by.razorpay.dependents);
    expect(by.email_owner.kind).toBe("SINGLE_OWNER");
    expect(by.windows.kind).toBe("RECURRING");
    expect(by.domain.kind).toBe("INFERRED");
    expect(by.phonepe).toBeUndefined();

    const ranked = rankQuestions(cands);
    for (let i = 1; i < ranked.length; i++) expect(ranked[i - 1].priority).toBeGreaterThanOrEqual(ranked[i].priority);
    // gap_db (8 x 3) ties with the conflict (6 x 4): CONFLICT wins the tie.
    expect(ranked.slice(0, 2).map((r) => [r.relatedClaimId, r.priority])).toEqual([
      ["razorpay", 24],
      ["gap_db", 24],
    ]);
  });

  it("caps at 10 and dedupes by related claim", () => {
    const mk = (i: number, p: number): QuestionCandidate => ({ kind: "MISSING", relatedClaimId: `c${i % 12}`, checklistKey: null, weight: 1, dependents: p, priority: p, question: "q", rationale: "r" });
    const ranked = rankQuestions(Array.from({ length: 30 }, (_, i) => mk(i, 30 - i)));
    expect(ranked).toHaveLength(10);
    expect(new Set(ranked.map((r) => r.relatedClaimId)).size).toBe(10);
  });

  it("ties break by kind: CONFLICT before MISSING before SINGLE_OWNER", () => {
    const base = { checklistKey: null, weight: 1, dependents: 1, priority: 6, question: "q", rationale: "r" };
    const ranked = rankQuestions([
      { ...base, kind: "SINGLE_OWNER", relatedClaimId: "a" },
      { ...base, kind: "MISSING", relatedClaimId: "b" },
      { ...base, kind: "CONFLICT", relatedClaimId: "c" },
    ]);
    expect(ranked.map((r) => r.kind)).toEqual(["CONFLICT", "MISSING", "SINGLE_OWNER"]);
  });

  it("toGapQuestions produces unanswered rows", () => {
    const [q] = toGapQuestions([{ kind: "MISSING", relatedClaimId: "x", checklistKey: "run_deploy", weight: 5, dependents: 2, priority: 10, question: "q?", rationale: "r" }], counterIds());
    expect(q).toEqual({ id: "gq_001", kind: "MISSING", question: "q?", rationale: "r", priority: 10, relatedClaimId: "x", checklistKey: "run_deploy", answer: null, answeredAt: null, testimonySourceId: null });
  });
});
