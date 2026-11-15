import { describe, expect, it } from "vitest";
import type { Snapshot, SnapshotClaim } from "./compile";
import { diffIsEmpty, diffSnapshots } from "./diff";

const claim = (id: string, over: Partial<SnapshotClaim> = {}): SnapshotClaim => ({
  id,
  type: "DECISION",
  section: "Decisions",
  title: `Claim ${id}`,
  statement: `Statement ${id}`,
  topicKey: id,
  grade: "VERIFIED",
  gradeReason: "",
  status: "DRAFT",
  access: "TEAM",
  fromTestimony: false,
  owner: null,
  date: null,
  reviewerNote: null,
  evidence: [],
  ...over,
});
const snap = (claims: SnapshotClaim[], conflicts: Snapshot["conflicts"] = [], answered: Snapshot["answeredQuestions"] = []) => ({
  claims,
  conflicts,
  answeredQuestions: answered,
});

describe("diffSnapshots", () => {
  it("is empty for identical snapshots", () => {
    const s = snap([claim("a"), claim("b")]);
    const d = diffSnapshots(s, s);
    expect(diffIsEmpty(d)).toBe(true);
    expect(d.unchanged).toBe(2);
  });

  it("does not report the DRAFT/EDITED -> APPROVED bookkeeping flip as a change, but does report a rejection", () => {
    const before = snap([claim("a"), claim("b", { status: "EDITED" }), claim("c")]);
    const after = snap([claim("a", { status: "APPROVED" }), claim("b", { status: "APPROVED" }), claim("c", { status: "REJECTED" })]);
    const d = diffSnapshots(before, after);
    expect(d.changed.map((c) => c.claim.id)).toEqual(["c"]);
    expect(d.changed[0].changes).toEqual([{ field: "status", from: "live", to: "REJECTED" }]);
    expect(d.unchanged).toBe(2);
  });

  it("reports added, removed, edited and re-graded claims, conflicts and answers", () => {
    const cf = { id: "cf1", topicKey: "payment_gateway", claimAId: "a", claimBId: "b", kind: "CONTRADICTS", status: "OPEN", resolution: null, note: null };
    const before = snap([claim("a", { grade: "CONFLICTING" }), claim("b"), claim("c")], [cf]);
    const after = snap(
      [claim("a", { grade: "VERIFIED", statement: "Razorpay is final" }), claim("c"), claim("d")],
      [{ ...cf, status: "RESOLVED", resolution: "A" }],
      [{ id: "gq_db", question: "Who holds the DB password?", answer: "Dev", relatedClaimId: "d" }],
    );
    const d = diffSnapshots(before, after);
    expect(d.added.map((c) => c.id)).toEqual(["d"]);
    expect(d.removed.map((c) => c.id)).toEqual(["b"]);
    expect(d.changed).toHaveLength(1);
    expect(d.changed[0].changes.map((c) => c.field).sort()).toEqual(["grade", "statement"]);
    expect(d.conflicts).toEqual([{ id: "cf1", topicKey: "payment_gateway", from: "OPEN", to: "RESOLVED", resolution: "A" }]);
    expect(d.answered.map((q) => q.id)).toEqual(["gq_db"]);
    expect(d.unchanged).toBe(1);
  });
});
