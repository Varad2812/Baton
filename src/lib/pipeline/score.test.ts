import { describe, expect, it } from "vitest";
import truth from "../../../seed/ground-truth.json";
import { cachedResult } from "./cache";
import { matchScore, scoreAgainstTruth, type GroundTruth } from "./score";
import { claim, ev } from "./test-helpers";

const T = truth as unknown as GroundTruth;

describe("scoreAgainstTruth", () => {
  it("the verified cache scores full recall and precision against ground truth", () => {
    const r = cachedResult();
    const s = scoreAgainstTruth(r, T, r.claims);
    expect(s.recall).toBe(1);
    expect(s.precision).toBe(1);
    expect(s.categories.conflicts.found).toBe(3);
    expect(s.categories.supersessions.found).toBe(3);
    expect(s.categories.decisions.gradeMatches).toBe(12);
    expect(s.quoteValidity.stored).toBe(1);
    expect(s.canaryInClaims).toBe(0);
  });

  it("an empty result scores zero recall and lists what was missed", () => {
    const s = scoreAgainstTruth({ claims: [], conflicts: [] }, T, cachedResult().claims);
    expect(s.recall).toBe(0);
    expect(s.categories.decisions.missed).toContain("auth_provider");
  });

  it("matches by wording + shared evidence + topic, not by id", () => {
    const expected = claim("clm_auth_supabase", {
      title: "Auth moved from Firebase to Supabase on 12 Mar",
      statement: "Firebase free tier hit limits during fest sign-ups.",
      topicKey: "auth_provider",
      evidence: [ev("chk_pr_84_0")],
    });
    const paraphrase = claim("clm_x", {
      title: "Authentication migrated to Supabase",
      statement: "Moved off Firebase after the free tier limits were hit during sign-ups.",
      topicKey: "auth_provider",
      evidence: [ev("chk_pr_84_0")],
    });
    const unrelated = claim("clm_y", { title: "Team size is 6", statement: "Max team size for group events.", topicKey: "team_size" });
    expect(matchScore(paraphrase, expected)).toBeGreaterThanOrEqual(0.4);
    expect(matchScore(unrelated, expected)).toBeLessThan(0.4);
    // A gap never matches a non-gap claim.
    expect(matchScore({ ...paraphrase, grade: "MISSING" }, expected)).toBe(0);
  });
});
