import { describe, expect, it } from "vitest";
import { journeyState } from "./journey";
import { isPrimary, navItemFor, NAV, ROLE_PRIMARY } from "@/components/shell/nav";

describe("journeyState", () => {
  it("an empty project starts at Collect", () => {
    expect(journeyState({ sources: 0, analysed: false, openConflicts: 0, openGaps: 0, approved: false })).toEqual({
      collect: "current",
      understand: "todo",
      gaps: "todo",
      approve: "todo",
      handover: "todo",
    });
  });

  it("the seeded demo (3 conflicts, 8 questions, nothing approved) is at Understand", () => {
    const s = journeyState({ sources: 40, analysed: true, openConflicts: 3, openGaps: 8, approved: false });
    expect(s.collect).toBe("done");
    expect(s.understand).toBe("current");
    expect(s.gaps).toBe("todo");
  });

  it("approval with open questions marks Fill gaps current and Approve done", () => {
    const s = journeyState({ sources: 40, analysed: true, openConflicts: 0, openGaps: 2, approved: true });
    expect(s).toMatchObject({ understand: "done", gaps: "current", approve: "done", handover: "done" });
  });

  it("new records after approval re-open Approve", () => {
    const s = journeyState({ sources: 40, analysed: true, openConflicts: 0, openGaps: 0, approved: true, changes: 5 });
    expect(s.approve).toBe("current");
  });
});

describe("role navigation", () => {
  it("every primary href exists in the nav and Home is always first", () => {
    const hrefs = new Set(NAV.map((n) => n.href));
    for (const list of Object.values(ROLE_PRIMARY)) {
      expect(list[0]).toBe("");
      for (const h of list) expect(hrefs.has(h)).toBe(true);
    }
    expect(isPrimary("REVIEWER", "/review")).toBe(true);
    expect(isPrimary("OBSERVER", "/review")).toBe(false);
  });

  it("maps sub-paths to their nav item", () => {
    expect(navItemFor("/sources/add").label).toBe("Sources");
    expect(navItemFor("/handover/receipt").href).toBe("/handover");
    expect(navItemFor("/trust").label).toBe("Safety checks");
    expect(navItemFor("").label).toBe("Home");
  });
});
