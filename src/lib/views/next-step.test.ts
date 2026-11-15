import { describe, expect, it } from "vitest";
import { nextStep } from "./next-step";

const p = { owner: "Meera", successor: "Arjun" };
const st = { openConflicts: 0, openQuestions: 0, versions: 0, slug: "x" };
describe("nextStep", () => {
  it("prioritises conflicts, then questions, then approval, then handover", () => {
    expect(nextStep({ ...st, openConflicts: 3, openQuestions: 2 }, p).label).toBe("Resolve 3 conflicts");
    expect(nextStep({ ...st, openQuestions: 1 }, p).label).toBe("Answer 1 question");
    expect(nextStep(st, p).label).toBe("Approve v1");
    expect(nextStep({ ...st, versions: 1 }, p)).toMatchObject({ label: "Open Arjun's handover", href: "/p/x/handover" });
  });
});
