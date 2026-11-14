import { describe, expect, it } from "vitest";
import { applyPreservation } from "./preserve";
import { claim, ev } from "./test-helpers";
import type { PGapQuestion } from "./types";

const q = (id: string, over: Partial<PGapQuestion> = {}): PGapQuestion => ({
  id,
  kind: "MISSING",
  question: id,
  rationale: "r",
  priority: 10,
  relatedClaimId: null,
  checklistKey: null,
  answer: null,
  answeredAt: null,
  testimonySourceId: null,
  ...over,
});

const chunks = new Set(["c1", "c2", "t1"]);

describe("applyPreservation", () => {
  it("keeps the old id and carries reviewer edits onto the new claim with the same topicKey+type", () => {
    const prior = [claim("old_auth", { topicKey: "auth", status: "EDITED", title: "Edited title", statement: "Edited", reviewerNote: "checked" })];
    const next = [claim("new_auth", { topicKey: "auth", title: "Model title", evidence: [ev("c1")] })];
    const r = applyPreservation({ claims: next, conflicts: [], gapQuestions: [] }, { claims: prior, conflicts: [], gapQuestions: [] }, chunks);
    expect(r.claims).toHaveLength(1);
    expect(r.claims[0]).toMatchObject({ id: "old_auth", title: "Edited title", statement: "Edited", status: "EDITED", reviewerNote: "checked" });
    expect(r.claims[0].evidence[0].chunkId).toBe("c1"); // fresh evidence
    expect(r.report.editsCarried).toBe(1);
  });

  it("keeps a rejection, and keeps an edited claim the new run no longer produces", () => {
    const prior = [
      claim("rej", { topicKey: "x", status: "REJECTED" }),
      claim("gone", { topicKey: "y", status: "EDITED", evidence: [ev("c2"), ev("deleted_chunk")] }),
      claim("untouched", { topicKey: "z" }),
    ];
    const next = [claim("n1", { topicKey: "x" })];
    const r = applyPreservation({ claims: next, conflicts: [], gapQuestions: [] }, { claims: prior, conflicts: [], gapQuestions: [] }, chunks);
    const by = Object.fromEntries(r.claims.map((c) => [c.id, c]));
    expect(by.rej.status).toBe("REJECTED");
    expect(by.gone.evidence.map((e) => e.chunkId)).toEqual(["c2"]);
    expect(by.untouched).toBeUndefined();
  });

  it("matches by type too: same topic but different type is a different claim", () => {
    const prior = [claim("old", { topicKey: "pay", type: "RISK", status: "EDITED" })];
    const next = [claim("new", { topicKey: "pay", type: "DECISION" })];
    const r = applyPreservation({ claims: next, conflicts: [], gapQuestions: [] }, { claims: prior, conflicts: [], gapQuestions: [] }, chunks);
    expect(r.claims.map((c) => c.id).sort()).toEqual(["new", "old"]);
  });

  it("keeps testimony claims and answered questions; drops the gap the answer filled", () => {
    const testimony = claim("clm_t_deploy", { topicKey: "deploy_process", fromTestimony: true, evidence: [ev("t1")] });
    const answered = q("gq_deploy", { relatedClaimId: "clm_t_deploy", checklistKey: "run_deploy", answer: "push to main", answeredAt: "2026-04-23T00:00:00Z", testimonySourceId: "src_t" });
    const nextGap = claim("gap_new", { grade: "MISSING", topicKey: "gap:run_deploy", checklistKeys: ["run_deploy"] });
    const nextQ = q("gq_new", { relatedClaimId: "gap_new", checklistKey: "run_deploy", priority: 50 });
    const r = applyPreservation(
      { claims: [nextGap], conflicts: [], gapQuestions: [nextQ] },
      { claims: [testimony], conflicts: [], gapQuestions: [answered] },
      chunks,
    );
    expect(r.claims.map((c) => c.id)).toEqual(["clm_t_deploy"]);
    expect(r.gapQuestions.map((x) => x.id)).toEqual(["gq_deploy"]);
    expect(r.gapQuestions[0].answer).toBe("push to main");
  });

  it("carries a reviewer's conflict resolution through re-runs (with id remap)", () => {
    const prior = {
      claims: [claim("a_old", { topicKey: "pay" }), claim("b_old", { topicKey: "pay", type: "TASK" })],
      conflicts: [{ id: "cf_old", topicKey: "pay", claimAId: "a_old", claimBId: "b_old", kind: "CONTRADICTS" as const, status: "RESOLVED" as const, resolution: "A" as const, note: "Razorpay" }],
      gapQuestions: [],
    };
    const next = {
      claims: [claim("a_new", { topicKey: "pay" }), claim("b_new", { topicKey: "pay", type: "TASK" })],
      conflicts: [{ id: "cf_new", topicKey: "pay", claimAId: "a_new", claimBId: "b_new", kind: "CONTRADICTS" as const, status: "OPEN" as const, resolution: null, note: null }],
      gapQuestions: [q("gq_pay", { kind: "CONFLICT", relatedClaimId: "a_new" })],
    };
    const r = applyPreservation(next, prior, chunks);
    expect(r.conflicts).toEqual([{ id: "cf_old", topicKey: "pay", claimAId: "a_old", claimBId: "b_old", kind: "CONTRADICTS", status: "RESOLVED", resolution: "A", note: "Razorpay" }]);
    expect(r.gapQuestions[0].relatedClaimId).toBe("a_old");
  });

  it("caps questions at 10 including answered ones and drops questions about rejected claims", () => {
    const answered = Array.from({ length: 3 }, (_, i) => q(`ans${i}`, { answer: "x", priority: 1 }));
    const nextClaims = Array.from({ length: 12 }, (_, i) => claim(`n${i}`, { topicKey: `t${i}` }));
    const prior = { claims: [claim("p0", { topicKey: "t0", status: "REJECTED" })], conflicts: [], gapQuestions: answered };
    const nextQs = nextClaims.map((c, i) => q(`q${i}`, { relatedClaimId: c.id, priority: 100 - i }));
    const r = applyPreservation({ claims: nextClaims, conflicts: [], gapQuestions: nextQs }, prior, chunks);
    expect(r.gapQuestions).toHaveLength(10);
    expect(r.gapQuestions.filter((x) => x.answer)).toHaveLength(3);
    expect(r.gapQuestions.some((x) => x.relatedClaimId === "p0")).toBe(false);
  });
});
