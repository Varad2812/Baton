import { describe, expect, it } from "vitest";
import { knowledgeFor } from "./knowledge";
import { PAGES } from "./actions";

// Ask Baton sends the current page's description with each question; every page must find its own line.
const EXPECT: Record<string, string> = {
  dashboard: "**Home**",
  insights: "**Insights**",
  radar: "**Knowledge at risk**",
  sources: "**Sources**",
  ledger: "**Facts**",
  conflicts: "**Conflicts**",
  interview: "**Questions for",
  review: "**Review & approve**",
  handover: "handover**",
  ask: "**Ask the handover**",
  trust: "**Safety checks**",
};

describe("knowledge base page descriptions", () => {
  for (const page of PAGES.filter((p) => p !== "landing" && p !== "new")) {
    it(`${page} gets its own description`, () => {
      const k = knowledgeFor("what is this page", page, () => 0);
      const current = k.split("## Current page\n")[1]?.split("\n## ")[0] ?? "";
      expect(current.trimStart().startsWith("- "), page).toBe(true);
      expect(current, page).toContain(EXPECT[page]);
    });
  }

  it("uses the new names (Home, Smart Draft, Guide) and not the old ones", () => {
    const k = knowledgeFor("how do I start the guide and judge", "dashboard", () => 0);
    expect(k).toContain("Guide");
    expect(k).not.toMatch(/Command centre|panel on the right/);
  });
});
