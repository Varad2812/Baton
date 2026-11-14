import { describe, expect, it } from "vitest";
import type { Role } from "@/generated/prisma/enums";
import { accessLevelsFor, type AllowedAccess } from "@/lib/authz";
import { cachedResult, PIPELINE_CACHE } from "@/lib/pipeline/cache";
import { compileView, scanForLeaks, templateWriter, type Snapshot, type Writer, type WriterInput } from "./compile";

const CANARY = "CANARY-RM-7F3A";

function festflowSnapshot(): Snapshot {
  const r = cachedResult();
  const chunks = new Map(PIPELINE_CACHE.chunks.map((c) => [c.id, c]));
  const sources = new Map(PIPELINE_CACHE.sources.map((s) => [s.id, s]));
  return {
    schema: 1,
    projectId: "prj_festflow",
    projectName: "FestFlow",
    createdAt: "2026-04-24T00:00:00.000Z",
    handover: { from: "Meera Kulkarni", to: "Arjun Mehta", reviewer: "Prof. S. Rao" },
    claims: r.claims
      .filter((c) => c.status !== "REJECTED")
      .map((c) => ({
        id: c.id,
        type: c.type,
        section: c.section,
        title: c.title,
        statement: c.statement,
        topicKey: c.topicKey,
        grade: c.grade,
        gradeReason: c.gradeReason,
        status: c.status,
        access: c.access,
        fromTestimony: c.fromTestimony,
        owner: null,
        date: c.date,
        reviewerNote: c.reviewerNote,
        evidence: c.evidence.map((e) => {
          const ch = chunks.get(e.chunkId)!;
          const s = sources.get(ch.sourceId)!;
          return { chunkId: ch.id, sourceId: s.id, sourceTitle: s.title, sourceKind: s.kind, access: ch.access, locator: ch.locator, quote: e.quote, relation: e.relation };
        }),
      })),
    conflicts: r.conflicts,
    answeredQuestions: [],
  };
}

const allowed = (role: Role, granted: string[] = []): AllowedAccess => ({ role, levels: accessLevelsFor(role), grantedSourceIds: granted });
const chunks = PIPELINE_CACHE.chunks.map((c) => ({ id: c.id, sourceId: c.sourceId, access: c.access, text: c.text }));

/** A "model" that copies everything it was given into its output. */
const echoWriter: Writer = async (inp) => ({
  overview: JSON.stringify(inp),
  plan7: inp.claims.slice(0, 3).map((c) => ({ text: `${c.title} ${c.quotes.join(" ")}`, claimIds: [c.id] })),
  plan30: [],
});

describe("compileView", () => {
  const snapshot = festflowSnapshot();

  it("the canary really is in the dataset (so the test is not vacuous)", () => {
    expect(chunks.some((c) => c.text.includes(CANARY) && c.access === "RESTRICTED")).toBe(true);
  });

  for (const role of ["INCOMING", "OBSERVER"] as const) {
    it(`${role}: the writer never receives the canary and the compiled view never contains it`, async () => {
      let seen: WriterInput | null = null;
      const spy: Writer = async (inp) => {
        seen = inp;
        return echoWriter(inp);
      };
      const r = await compileView({ snapshot, role, allowed: allowed(role), chunks, writer: spy });
      expect(JSON.stringify(seen)).not.toContain(CANARY);
      expect(JSON.stringify(r.compiled)).not.toContain(CANARY);
      expect(r.compiled.canary.checked).toBeGreaterThan(0);
      expect(r.compiled.canary.hits).toBe(0);
      expect(r.hiddenCount).toBeGreaterThan(0);
      // Every visible claim's evidence is within the role's access.
      for (const s of r.compiled.sections) {
        for (const c of s.items) for (const e of c.evidence) expect(allowed(role).levels).toContain(e.access);
      }
    });
  }

  it("INCOMING sees TEAM claims but no RESTRICTED claim; hidden claims are counted per section", async () => {
    const r = await compileView({ snapshot, role: "INCOMING", allowed: allowed("INCOMING"), chunks, writer: templateWriter });
    const restricted = snapshot.claims.filter((c) => c.access === "RESTRICTED").length;
    expect(restricted).toBeGreaterThan(0);
    expect(r.hiddenCount).toBe(restricted);
    expect(r.compiled.sections.reduce((n, s) => n + s.hidden, 0)).toBe(restricted);
    expect(r.writerInput.claims.some((c) => c.id === "clm_auth_supabase")).toBe(true);
  });

  it("OBSERVER sees only claims whose every evidence chunk is PUBLIC", async () => {
    const r = await compileView({ snapshot, role: "OBSERVER", allowed: allowed("OBSERVER"), chunks, writer: templateWriter });
    for (const c of r.writerInput.claims) {
      const sc = snapshot.claims.find((x) => x.id === c.id)!;
      expect(sc.evidence.every((e) => e.access === "PUBLIC")).toBe(true);
    }
  });

  it("a writer that leaks a canary is discarded in favour of the leak-free template", async () => {
    const leaky: Writer = async (inp) => ({ overview: `Budget ref ${CANARY}`, plan7: [{ text: "x", claimIds: [inp.claims[0].id] }], plan30: [] });
    const r = await compileView({ snapshot, role: "INCOMING", allowed: allowed("INCOMING"), chunks, writer: leaky });
    expect(r.compiled.writer).toBe("template");
    expect(r.compiled.canary.fallback).toBe(true);
    expect(r.compiled.canary.hits).toBe(0);
    expect(JSON.stringify(r.compiled)).not.toContain(CANARY);
  });

  it("plan items citing hidden or unknown claims are dropped", async () => {
    const hiddenId = snapshot.claims.find((c) => c.access === "RESTRICTED")!.id;
    const w: Writer = async (inp) => ({
      overview: "ok",
      plan7: [
        { text: "hidden", claimIds: [hiddenId] },
        { text: "made up", claimIds: ["clm_nope"] },
        { text: "real", claimIds: [inp.claims[0].id] },
      ],
      plan30: [],
    });
    const r = await compileView({ snapshot, role: "INCOMING", allowed: allowed("INCOMING"), chunks, writer: w });
    expect(r.compiled.plan7.map((p) => p.text)).toEqual(["real"]);
  });

  it("OWNER sees everything; a per-source grant lets INCOMING see that RESTRICTED source", async () => {
    const owner = await compileView({ snapshot, role: "OWNER", allowed: allowed("OWNER"), chunks, writer: templateWriter });
    expect(owner.hiddenCount).toBe(0);
    const granted = await compileView({ snapshot, role: "INCOMING", allowed: allowed("INCOMING", ["src_budget"]), chunks, writer: templateWriter });
    expect(granted.hiddenCount).toBe(0);
    expect(granted.compiled.canary.checked).toBe(0);
  });

  it("scanForLeaks matches across case and whitespace", () => {
    expect(scanForLeaks({ a: "canary-rm-7f3a" }, [CANARY])).toEqual([CANARY]);
    expect(scanForLeaks({ a: "nothing here" }, [CANARY])).toEqual([]);
  });
});

describe("forbiddenStrings", () => {
  it("does not flag a hidden quote that is also present in material the role can see", async () => {
    const { forbiddenStrings } = await import("./compile");
    const pub = { id: "p", sourceId: "sp", access: "PUBLIC" as const, text: "Registrations close on 28 April. Spread the word." };
    const team = { id: "t", sourceId: "st", access: "TEAM" as const, text: "Registrations close on 28 April. Internal: CANARY-XY-1 budget line." };
    const hidden = [
      {
        id: "h", type: "DECISION" as const, section: "Deadlines", title: "t", statement: "s", topicKey: "k", grade: "SINGLE_SOURCE" as const,
        gradeReason: "", status: "DRAFT", access: "TEAM" as const, fromTestimony: false, owner: null, date: null, reviewerNote: null,
        evidence: [
          { chunkId: "t", sourceId: "st", sourceTitle: "", sourceKind: "DOC", access: "TEAM" as const, locator: "", quote: "Registrations close on 28 April.", relation: "SUPPORTS" as const },
          { chunkId: "t", sourceId: "st", sourceTitle: "", sourceKind: "DOC", access: "TEAM" as const, locator: "", quote: "Internal: CANARY-XY-1 budget line.", relation: "SUPPORTS" as const },
        ],
      },
    ];
    const f = forbiddenStrings(allowed("OBSERVER"), [pub, team], hidden);
    expect(f).toContain("CANARY-XY-1");
    expect(f).toContain("Internal: CANARY-XY-1 budget line.");
    expect(f).not.toContain("Registrations close on 28 April.");
  });
});
