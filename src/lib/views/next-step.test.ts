import { describe, expect, it } from "vitest";
import { nextStep } from "./next-step";

const p = { owner: "Meera", successor: "Arjun", reviewer: "Prof. S. Rao" };
const st = { openConflicts: 0, openQuestions: 0, versions: 0, slug: "x" };

describe("nextStep", () => {
  it("owner: questions first (only they can answer), then conflicts, then review, then handover", () => {
    expect(nextStep({ ...st, openConflicts: 3, openQuestions: 2 }, p, "OWNER").label).toBe("Answer 2 questions");
    expect(nextStep({ ...st, openConflicts: 3 }, p, "OWNER").label).toBe("Resolve 3 conflicts");
    expect(nextStep({ ...st, openQuestions: 1 }, p, "OWNER").label).toBe("Answer 1 question");
    expect(nextStep(st, p, "OWNER")).toMatchObject({ label: "Review the draft", reason: expect.stringContaining("cannot approve your own") });
    expect(nextStep({ ...st, versions: 1 }, p, "OWNER")).toMatchObject({ label: "Open Arjun's handover", href: "/p/x/handover" });
  });
  it("reviewer: conflicts, then approve, then Draft v2 when facts changed", () => {
    expect(nextStep({ ...st, openConflicts: 1 }, p, "REVIEWER").href).toBe("/p/x/conflicts");
    expect(nextStep({ ...st, openQuestions: 2 }, p, "REVIEWER")).toMatchObject({ label: "Approve v1", reason: expect.stringContaining("override") });
    expect(nextStep({ ...st, versions: 1, changes: 4 }, p, "REVIEWER")).toMatchObject({ label: "Draft v2", href: "/p/x/review?changes=1" });
  });
  it("successor and observer are never sent to a reviewer-only action", () => {
    for (const role of ["INCOMING", "OBSERVER"] as const) {
      for (const s of [{ ...st, openConflicts: 3 }, { ...st, openQuestions: 2 }, st, { ...st, versions: 1, changes: 2 }]) {
        const n = nextStep(s, p, role);
        expect(n.href).not.toMatch(/conflicts|review|interview/);
      }
    }
    expect(nextStep(st, p, "INCOMING").label).toBe("Read the draft handover");
    expect(nextStep(st, p, "OBSERVER").label).toBe("Browse the facts");
  });
});
