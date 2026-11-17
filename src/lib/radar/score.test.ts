import { describe, expect, it } from "vitest";
import { codeRisk, scoreRadar, type RadarClaim } from "./score";

const fact = (id: string, over: Partial<RadarClaim> = {}): RadarClaim => ({
  id,
  title: `Fact ${id}`,
  type: "DECISION",
  section: "Decisions",
  grade: "VERIFIED",
  status: "DRAFT",
  date: "2026-03-01",
  owner: "Meera Kulkarni",
  sourceKinds: ["DOC"],
  supports: 2,
  ...over,
});

const base = {
  owner: "Meera Kulkarni",
  people: [
    { name: "Meera Kulkarni", roleTitle: "Tech lead" },
    { name: "Arjun Mehta", roleTitle: "Incoming" },
  ],
  areas: [
    { area: "services/email-templates", commits: 23, top: { name: "Meera Kulkarni", commits: 23, share: 1 }, others: [], lastCommit: "2026-04-20", busFactor: 1 },
    { area: "apps/web", commits: 20, top: { name: "Arjun Mehta", commits: 8, share: 0.4 }, others: [{ name: "Meera Kulkarni", commits: 7 }, { name: "Kabir Shah", commits: 5 }], lastCommit: "2026-04-21", busFactor: 2 },
  ],
  claims: [
    fact("pay", { grade: "CONFLICTING" }),
    fact("db", { grade: "MISSING", section: "Access & secrets", title: "No record: who holds the DB password" }),
    fact("chatonly", { grade: "SINGLE_SOURCE", supports: 1, sourceKinds: ["CHAT"] }),
    fact("csv", { type: "TASK", section: "Open work", owner: null, grade: "SINGLE_SOURCE", supports: 1, date: "2026-02-01", title: "CSV export (unassigned)" }),
  ],
  secrets: [{ mentionedBy: "Meera Kulkarni", where: "#dev" }],
  credentialsOwnerKnown: false,
  asOf: "2026-04-25",
};

describe("radar scoring", () => {
  it("scores a sole-owner area above a shared one", () => {
    expect(codeRisk(base.areas[0])).toBeGreaterThan(codeRisk(base.areas[1]));
    expect(codeRisk(base.areas[0])).toBe(100);
  });

  it("produces one actionable item per finding, riskiest first", () => {
    const r = scoreRadar(base);
    const kinds = r.items.map((i) => i.kind);
    expect(kinds).toEqual(expect.arrayContaining(["single_owner", "secret_no_owner", "missing", "conflict", "one_source_decision", "stale_task"]));
    expect(r.items[0].kind).toBe("single_owner");
    expect(r.items.find((i) => i.kind === "single_owner")?.action.label).toBe("Ask Meera to document email-templates");
    expect(r.items.every((i, k) => k === 0 || r.items[k - 1].severity >= i.severity)).toBe(true);
  });

  it("scores every person, not only the one leaving", () => {
    const r = scoreRadar(base);
    expect(r.people.map((p) => p.name)).toEqual(["Meera Kulkarni", "Arjun Mehta"]);
    expect(r.people[0].soleAreas).toEqual(["email-templates"]);
    expect(r.people[0].concentration).toBeGreaterThan(r.people[1].concentration);
  });

  it("a second committer lowers the area's risk", () => {
    const shared = { ...base.areas[0], commits: 25, top: { name: "Meera Kulkarni", commits: 23, share: 0.92 }, others: [{ name: "Arjun Mehta", commits: 2 }], busFactor: 1 };
    expect(codeRisk(shared)).toBeLessThan(codeRisk(base.areas[0]));
  });

  it("no secret finding once a credentials owner is recorded", () => {
    expect(scoreRadar({ ...base, credentialsOwnerKnown: true }).items.some((i) => i.kind === "secret_no_owner")).toBe(false);
  });
});
