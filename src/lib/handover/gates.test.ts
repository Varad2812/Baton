import { describe, expect, it } from "vitest";
import { approvalBlockers, decideApproval, priorityTier } from "./gates";

const conflict = (id: string, status: string, a: string, b: string) => ({ id, kind: "CONTRADICTS", status, topicKey: `topic_${id}`, claimAId: a, claimBId: b });
const q = (id: string, kind: string, priority: number, relatedClaimId: string | null = null, answer: string | null = null) => ({
  id,
  kind,
  priority,
  question: `question ${id}`,
  answer,
  relatedClaimId,
});

describe("priorityTier", () => {
  it("splits at 40 and 20", () => {
    expect(priorityTier(54)).toBe("P1");
    expect(priorityTier(40)).toBe("P1");
    expect(priorityTier(39)).toBe("P2");
    expect(priorityTier(20)).toBe("P2");
    expect(priorityTier(12)).toBe("P3");
  });
});

describe("approvalBlockers", () => {
  it("lists open contradictions and unanswered P1 gaps", () => {
    const b = approvalBlockers({
      conflicts: [conflict("c1", "OPEN", "a", "b"), conflict("c2", "RESOLVED", "c", "d"), { ...conflict("s1", "OPEN", "e", "f"), kind: "SUPERSEDES" }],
      questions: [q("gq_db", "MISSING", 48), q("gq_low", "MISSING", 21), q("gq_done", "MISSING", 60, null, "answered")],
    });
    expect(b.map((x) => x.id)).toEqual(["c1", "gq_db"]);
  });

  it("does not double count a P1 conflict question, and drops it once the conflict is resolved", () => {
    const qs = [q("gq_payment", "CONFLICT", 54, "clm_a")];
    expect(approvalBlockers({ conflicts: [conflict("c1", "OPEN", "clm_a", "clm_b")], questions: qs }).map((x) => x.id)).toEqual(["c1"]);
    expect(approvalBlockers({ conflicts: [conflict("c1", "RESOLVED", "clm_a", "clm_b")], questions: qs })).toEqual([]);
  });
});

describe("decideApproval", () => {
  const blockers = approvalBlockers({ conflicts: [conflict("c1", "OPEN", "a", "b")], questions: [] });
  it("allows approval without blockers", () => {
    expect(decideApproval([], {})).toEqual({ ok: true, override: false });
  });
  it("blocks without an override", () => {
    const d = decideApproval(blockers, {});
    expect(d.ok).toBe(false);
    expect(!d.ok && d.reason).toMatch(/1 open conflict/);
  });
  it("requires a real note with the override", () => {
    expect(decideApproval(blockers, { override: true, note: "ok" }).ok).toBe(false);
    expect(decideApproval(blockers, { override: true, note: "Refund cutoff confirmed with Dev by phone." })).toEqual({ ok: true, override: true });
  });
});
