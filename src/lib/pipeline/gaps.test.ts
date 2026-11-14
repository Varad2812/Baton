import { describe, expect, it } from "vitest";
import { cachedResult, PIPELINE_CACHE } from "./cache";
import { CHECKLIST } from "./checklist";
import { buildGapClaims, gapClaim, runChecklist, singleOwnerAreas, singleOwnerClaim } from "./gaps";
import { counterIds } from "./ids";
import { findQuote } from "./quotes";
import { claim, ev } from "./test-helpers";
import type { PPerson } from "./types";

describe("runChecklist", () => {
  it("has exactly the 12 handover items", () => {
    expect(CHECKLIST.map((c) => c.key)).toEqual([
      "purpose_status",
      "run_deploy",
      "code_docs",
      "credentials_owner",
      "production_access",
      "open_work",
      "key_decisions",
      "external_dependencies",
      "key_contacts",
      "recurring_problems",
      "upcoming_deadlines",
      "review_approval",
    ]);
  });

  it("an item is met only by an evidenced, non-rejected, non-inferred claim tagged with it", () => {
    const claims = [
      claim("ok", { checklistKeys: ["key_decisions"], grade: "VERIFIED", evidence: [ev("c")] }),
      claim("inferred", { checklistKeys: ["credentials_owner"], grade: "INFERRED" }),
      claim("rejected", { checklistKeys: ["run_deploy"], grade: "VERIFIED", status: "REJECTED" }),
      claim("conflicting", { checklistKeys: ["upcoming_deadlines"], grade: "CONFLICTING" }),
    ];
    const r = Object.fromEntries(runChecklist(claims).map((x) => [x.key, x.met]));
    expect(r.key_decisions).toBe(true);
    expect(r.upcoming_deadlines).toBe(true);
    expect(r.credentials_owner).toBe(false);
    expect(r.run_deploy).toBe(false);
    expect(Object.values(r).filter(Boolean)).toHaveLength(2);
  });

  it("falls back to sections when no claim carries checklist tags", () => {
    const r = runChecklist([claim("a", { section: "Contacts", grade: "VERIFIED" })]);
    expect(r.find((x) => x.key === "key_contacts")!.met).toBe(true);
    expect(r.find((x) => x.key === "run_deploy")!.met).toBe(false);
  });

  it("every unmet item becomes a MISSING claim with a gap: topic, unless a specific gap covers it", () => {
    const checklist = runChecklist([claim("a", { checklistKeys: ["key_decisions"], grade: "VERIFIED" })]);
    const gaps = buildGapClaims(
      checklist,
      [{ checklistKey: "credentials_owner", topicKey: "gap:db_password", title: "Who holds the production database password", statement: "No record." }],
      counterIds(),
    );
    expect(gaps).toHaveLength(11); // 11 unmet; credentials covered by the specific gap
    expect(gaps.every((g) => g.grade === "MISSING" && g.evidence.length === 0 && g.topicKey.startsWith("gap:"))).toBe(true);
    expect(gaps[0].topicKey).toBe("gap:db_password");
    expect(gaps.some((g) => g.topicKey === "gap:credentials_owner")).toBe(false);
    expect(gaps.find((g) => g.topicKey === "gap:run_deploy")!.gradeReason).toBe("Checklist: How to run / deploy. 0 records");
  });

  it("gapClaim maps checklist items to claim types and sections", () => {
    const g = gapClaim({ checklistKey: "key_contacts", topicKey: "sponsor_contact", title: "Current sponsor contact", statement: "x" }, counterIds());
    expect(g).toMatchObject({ type: "CONTACT", section: "Contacts", topicKey: "gap:sponsor_contact", checklistKeys: ["key_contacts"] });
  });
});

describe("singleOwnerAreas (FestFlow commit history)", () => {
  const cache = cachedResult();
  void cache;
  const people: PPerson[] = (PIPELINE_CACHE as unknown as { people: PPerson[] }).people;

  it("finds services/email-templates: Meera, 23 of 23 commits", () => {
    const areas = singleOwnerAreas(PIPELINE_CACHE.chunks, PIPELINE_CACHE.sources, people);
    const et = areas.find((a) => a.area === "services/email-templates");
    expect(et).toBeDefined();
    expect(et!.person.name).toBe("Meera Kulkarni");
    expect(et!.commits).toBe(23);
    expect(et!.total).toBe(23);
    expect(et!.topicKey).toBe("email_templates_owner");
  });

  it("builds an INFERRED risk whose quotes are exact substrings of commit chunks", () => {
    const areas = singleOwnerAreas(PIPELINE_CACHE.chunks, PIPELINE_CACHE.sources, people);
    const chunks = new Map(PIPELINE_CACHE.chunks.map((c) => [c.id, c]));
    const c = singleOwnerClaim(areas[0], chunks, counterIds());
    expect(c.isInference).toBe(true);
    expect(c.evidence.length).toBeGreaterThan(0);
    for (const e of c.evidence) {
      const ch = chunks.get(e.chunkId)!;
      expect(ch.text.slice(e.matchStart!, e.matchEnd!)).toBe(e.quote);
      expect(findQuote(ch.text, e.quote)).not.toBeNull();
    }
  });

  it("ignores areas below the commit or share threshold", () => {
    const areas = singleOwnerAreas(PIPELINE_CACHE.chunks, PIPELINE_CACHE.sources, people, { minCommits: 1000 });
    expect(areas).toEqual([]);
  });
});
