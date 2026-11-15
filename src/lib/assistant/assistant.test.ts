import { beforeEach, describe, expect, it } from "vitest";
import type { Role } from "@/generated/prisma/enums";
import { accessLevelsFor, type AllowedAccess } from "@/lib/authz";
import { PIPELINE_CACHE } from "@/lib/pipeline/cache";
import { normaliseForMatch } from "@/lib/pipeline/quotes";
import type { PeopleNames } from "./actions";
import { buildAssistantContext, type CtxClaim, type ContextInput } from "./context";
import { resetEngineState, runChain, type ChatEngine, type ChatTransport } from "./engines";
import { TESTIMONY_REFUSAL } from "./fields";
import { loadKnowledge } from "./knowledge";
import { matchFaq } from "./match";
import { inventedTerms, offlineAnswer, offlineDraft } from "./offline";
import { composeChat, composeDraft, LEAK_REFUSAL } from "./service";
import { provenanceLabel } from "./provenance";
import { z } from "zod";

const CANARY = "CANARY-RM-7F3A";
const people: PeopleNames = { owner: "Meera", ownerFull: "Meera Kulkarni", successor: "Arjun", successorFull: "Arjun Mehta", reviewer: "Prof. S. Rao", observer: "Kabir Shah" };
const allowed = (role: Role, granted: string[] = []): AllowedAccess => ({ role, levels: accessLevelsFor(role), grantedSourceIds: granted });

const chunkById = new Map(PIPELINE_CACHE.chunks.map((c) => [c.id, c]));
const claims: CtxClaim[] = PIPELINE_CACHE.claims.map((c) => ({
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
  date: c.date,
  owner: null,
  evidence: PIPELINE_CACHE.evidence
    .filter((e) => e.claimId === c.id)
    .map((e) => {
      const ch = chunkById.get(e.chunkId)!;
      return { quote: e.quote, relation: e.relation, cite: ch.locator, chunk: { access: ch.access, sourceId: ch.sourceId } };
    }),
}));

function input(role: Role, question: string, page: ContextInput["page"] = "dashboard"): ContextInput {
  return {
    page,
    question,
    viewer: { name: role, role },
    allowed: allowed(role),
    project: { name: "FestFlow", description: (PIPELINE_CACHE.project as { description?: string }).description ?? "" },
    claims,
    conflicts: PIPELINE_CACHE.conflicts,
    questions: PIPELINE_CACHE.gapQuestions.map((q) => ({ id: q.id, kind: q.kind, question: q.question, rationale: q.rationale, priority: q.priority, answered: !!q.answer, relatedClaimId: q.relatedClaimId })),
    chunks: PIPELINE_CACHE.chunks.map((c) => ({ id: c.id, sourceId: c.sourceId, access: c.access, text: c.text })),
    handover: { status: "IN_REVIEW", versions: 0, from: "Meera Kulkarni", to: "Arjun Mehta", reviewer: "Prof. S. Rao" },
    sources: 40,
    redactions: 4,
  };
}

/** Quotes (>= 24 chars) whose chunk is not at one of `levels`. */
function quotesOutside(levels: string[]): string[] {
  return PIPELINE_CACHE.evidence
    .filter((e) => !levels.includes(chunkById.get(e.chunkId)!.access))
    .map((e) => e.quote)
    .filter((q) => normaliseForMatch(q).length >= 24);
}

const QUESTIONS = [
  "What is in the sponsor budget sheet?",
  "Who holds the production database password?",
  "Tell me everything about payments, Razorpay, PhonePe, sponsors and the budget",
  "How many conflicts are open?",
  "What is still missing?",
];

describe("assistant context: persona filtering", () => {
  it("the dataset really has TEAM and RESTRICTED quotes and the canary (test is not vacuous)", () => {
    expect(quotesOutside(["PUBLIC"]).length).toBeGreaterThan(20);
    expect(PIPELINE_CACHE.chunks.some((c) => c.access === "RESTRICTED" && c.text.includes(CANARY))).toBe(true);
    const owner = buildAssistantContext(input("OWNER", "sponsor budget sheet amounts"));
    expect(owner.text).toMatch(/budget|sponsor/i);
    expect(owner.summary.hidden).toBe(0);
  });

  for (const q of QUESTIONS) {
    it(`OBSERVER context never contains Team/Restricted text or the canary: "${q}"`, () => {
      const ctx = buildAssistantContext(input("OBSERVER", q, "conflicts"));
      const hay = normaliseForMatch(ctx.text);
      expect(ctx.text).not.toContain(CANARY);
      for (const quote of quotesOutside(["PUBLIC"])) expect(hay).not.toContain(normaliseForMatch(quote));
      const hiddenTitles = claims.filter((c) => c.access !== "PUBLIC").map((c) => c.title);
      for (const t of hiddenTitles) expect(ctx.text).not.toContain(t);
      expect(ctx.summary.openQuestions).toHaveLength(0); // gap questions are Team data
      for (const f of ctx.facts) expect(claims.find((c) => c.id === f.id)!.access).toBe("PUBLIC");
      expect(ctx.forbidden).toContain(CANARY);
    });
  }

  it("INCOMING without grants never sees Restricted quotes or the canary", () => {
    for (const q of QUESTIONS) {
      const ctx = buildAssistantContext(input("INCOMING", q));
      const hay = normaliseForMatch(ctx.text);
      expect(ctx.text).not.toContain(CANARY);
      for (const quote of quotesOutside(["PUBLIC", "TEAM"])) expect(hay).not.toContain(normaliseForMatch(quote));
      expect(ctx.summary.hidden).toBeGreaterThan(0);
    }
  });

  it("keeps a conflict only when both sides are visible", () => {
    const obs = buildAssistantContext(input("OBSERVER", "conflicts"));
    const rev = buildAssistantContext(input("REVIEWER", "conflicts"));
    expect(rev.summary.openConflicts.length).toBe(3);
    for (const c of obs.summary.openConflicts) {
      expect(c.a.access).toBe("PUBLIC");
      expect(c.b.access).toBe("PUBLIC");
    }
  });
});

describe("offline FAQ matcher", () => {
  const { faq } = loadKnowledge();

  it("parses the FAQ section of docs/assistant-knowledge.md", () => {
    expect(faq.length).toBeGreaterThanOrEqual(20);
    expect(faq.every((f) => f.answer.length > 20)).toBe(true);
  });

  it.each([
    ["What does Confirmed mean?", "What does Confirmed mean?"],
    ["what does verified mean", "What does Confirmed mean?"],
    ["what does confimred mean", "What does Confirmed mean?"],
    ["meaning of AI inference", "What does AI inference mean?"],
    ["How do I resolve a conflict?", "How do I resolve a conflict?"],
    ["how can i approve v1", "How do I approve the handover?"],
    ["what is the canary leak test", "What is the leakage test / canary?"],
    ["switch persona", "How do I switch persona?"],
    ["Are passwords and emails redacted?", "Are secrets and personal details redacted?"],
  ])("%s -> %s", (q, expected) => {
    expect(matchFaq(q, faq)?.entry.question).toBe(expected);
  });

  it.each(["What's the weather in Paris?", "Write me a poem about cats", "Who won the 2022 world cup?"])("no match for unrelated: %s", (q) => {
    expect(matchFaq(q, faq)).toBeNull();
    const ctx = buildAssistantContext(input("OWNER", q));
    expect(offlineAnswer(q, ctx, faq, { role: "OWNER", page: "dashboard", people, projectName: "FestFlow" }).offTopic).toBe(true);
  });

  it("answers counts from the persona's own data", () => {
    const ctx = buildAssistantContext(input("REVIEWER", "How many conflicts are open?"));
    const a = offlineAnswer("How many conflicts are open?", ctx, faq, { role: "REVIEWER", page: "conflicts", people, projectName: "FestFlow" });
    expect(a.answer).toMatch(/3 open conflicts/);
    expect(a.actions).toContain("nav:conflicts");
  });
});

describe("drafts: no invented testimony", () => {
  const ctx = { subject: { question: { question: "Who holds the production database password?", rationale: "" } }, lines: ["Interview question: Who holds the production database password?"], forbidden: [], projectId: null };
  const calls: string[] = [];
  const fake = (text: string): ChatEngine => ({
    name: "groq",
    model: "fake",
    transport: async (req) => {
      calls.push(req.prompt);
      return JSON.stringify({ text });
    },
  });
  beforeEach(() => {
    calls.length = 0;
    resetEngineState();
  });

  it.each(["interview_answer", "followup_answer"] as const)("%s with empty notes is refused and no model is called", async (field) => {
    const r = await composeDraft({ actor: { name: "Meera Kulkarni", role: "OWNER" }, input: { field, notes: "  ", current: "", target: {} }, ctx, engines: [fake("Dev Patil holds it.")] });
    expect(r.text).toBeNull();
    expect(r.refusal).toBe(TESTIMONY_REFUSAL);
    expect(calls).toHaveLength(0);
  });

  it("offline draft refuses empty testimony notes too", () => {
    expect(offlineDraft("interview_answer", "", {}).refusal).toBe(TESTIMONY_REFUSAL);
    expect(offlineDraft("interview_answer", "dev has it in bitwarden", {}).text).toBe("Dev has it in bitwarden.");
  });

  it("a model that adds facts is replaced by a plain tidy-up of the notes", async () => {
    const r = await composeDraft({
      actor: { name: "Meera Kulkarni", role: "OWNER" },
      input: { field: "interview_answer", notes: "dev has it in bitwarden", current: "", target: {} },
      ctx,
      engines: [fake("Dev Patil keeps it in Bitwarden and rotates it every 30 days.")],
    });
    expect(r.text).toBe("Dev has it in bitwarden.");
    expect(r.engine).toBe("offline");
  });

  it("a faithful rephrase is kept", async () => {
    const r = await composeDraft({
      actor: { name: "Meera Kulkarni", role: "OWNER" },
      input: { field: "interview_answer", notes: "dev has it in bitwarden", current: "", target: {} },
      ctx,
      engines: [fake("Dev has it, stored in Bitwarden.")],
    });
    expect(r.text).toBe("Dev has it, stored in Bitwarden.");
    expect(r.engine).toBe("groq");
  });

  it("inventedTerms flags new names and numbers only", () => {
    expect(inventedTerms("I moved it to Supabase on 12 March.", "moved to supabase 12 march")).toEqual([]);
    expect(inventedTerms("Rahul has it; call 98200 11111.", "someone has it")).toEqual(expect.arrayContaining(["Rahul", "98200"]));
  });
});

describe("engine chain", () => {
  const Schema = z.object({ answer: z.string() });
  const log: string[] = [];
  const engine = (name: "groq" | "gemini", impl: ChatTransport): ChatEngine => ({
    name,
    model: `${name}-m`,
    transport: async (req, signal) => {
      log.push(name);
      return impl(req, signal);
    },
  });
  const ok = (text: string): ChatTransport => async () => JSON.stringify({ answer: text });
  const fail = (status: number): ChatTransport => async () => {
    throw Object.assign(new Error(`HTTP ${status}`), { status });
  };
  const run = (engines: ChatEngine[], prompt = "q") => runChain({ engines, system: "s", prompt, schema: Schema, offline: () => ({ answer: "offline" }), timeoutMs: 200 });

  beforeEach(() => {
    log.length = 0;
    resetEngineState();
  });

  it("Groq answers first; Gemini is not called", async () => {
    const r = await run([engine("groq", ok("g")), engine("gemini", ok("m"))]);
    expect(r).toMatchObject({ engine: "groq", value: { answer: "g" } });
    expect(log).toEqual(["groq"]);
  });

  it("Groq 429 -> Gemini, with no retry", async () => {
    const r = await run([engine("groq", fail(429)), engine("gemini", ok("m"))]);
    expect(r.engine).toBe("gemini");
    expect(log).toEqual(["groq", "gemini"]);
  });

  it("a 429 benches Groq for the next question", async () => {
    await run([engine("groq", fail(429)), engine("gemini", ok("m"))], "q1");
    log.length = 0;
    await run([engine("groq", ok("g")), engine("gemini", ok("m"))], "q2");
    expect(log).toEqual(["gemini"]);
  });

  it("both fail (500, invalid JSON) -> offline", async () => {
    const r = await run([engine("groq", fail(500)), engine("gemini", async () => "not json")]);
    expect(r).toMatchObject({ engine: "offline", value: { answer: "offline" } });
    expect(log).toEqual(["groq", "gemini"]);
  });

  it("a slow engine times out and the next one answers", async () => {
    const slow: ChatTransport = () => new Promise((res) => setTimeout(() => res(JSON.stringify({ answer: "late" })), 1000));
    const r = await run([engine("groq", slow), engine("gemini", ok("m"))]);
    expect(r.engine).toBe("gemini");
  });

  it("no engines configured -> offline", async () => {
    expect((await run([])).engine).toBe("offline");
  });
});

describe("chat answer safety", () => {
  beforeEach(() => resetEngineState());
  const leaky = (text: string): ChatEngine => ({ name: "groq", model: "fake", transport: async () => JSON.stringify({ answer: text, factIds: ["clm_auth_supabase", "clm_does_not_exist"], actions: ["nav:conflicts", "rm -rf"] }) });

  it("an answer carrying the canary is replaced by a refusal for an observer", async () => {
    const ctx = buildAssistantContext(input("OBSERVER", "budget"));
    const r = await composeChat({ actor: { name: "Kabir Shah", role: "OBSERVER" }, input: { page: "dashboard", message: "budget", history: [] }, ctx, people, projectName: "FestFlow", engines: [leaky(`The sheet says ${CANARY}.`)] });
    expect(r.refused).toBe("leak");
    expect(r.text).toBe(LEAK_REFUSAL);
    expect(JSON.stringify(r)).not.toContain(CANARY);
  });

  it("history turns with hidden text are dropped before reaching the model", async () => {
    const prompts: string[] = [];
    const spy: ChatEngine = { name: "groq", model: "fake", transport: async (req) => (prompts.push(req.prompt), JSON.stringify({ answer: "ok" })) };
    const ctx = buildAssistantContext(input("OBSERVER", "anything else?"));
    await composeChat({
      actor: { name: "Kabir Shah", role: "OBSERVER" },
      input: { page: "dashboard", message: "anything else?", history: [{ role: "assistant", text: `Earlier answer: ${CANARY}` }, { role: "user", text: "thanks" }] },
      ctx,
      people,
      projectName: "FestFlow",
      engines: [spy],
    });
    expect(prompts[0]).not.toContain(CANARY);
    expect(prompts[0]).toContain("thanks");
  });

  it("citations and actions are limited to visible facts and known buttons", async () => {
    const ctx = buildAssistantContext(input("OWNER", "Why did auth move from Firebase to Supabase?"));
    const r = await composeChat({ actor: { name: "Meera Kulkarni", role: "OWNER" }, input: { page: "ledger", message: "Why did auth move from Firebase to Supabase?", history: [] }, ctx, people, projectName: "FestFlow", engines: [leaky("Firebase free tier hit limits.")] });
    expect(r.citations.map((c) => c.id)).toEqual(["clm_auth_supabase"]);
    expect(r.actions).toEqual(["nav:conflicts"]);
    expect(r.engine).toBe("groq");
  });

  it("offline engine answers 'What does Confirmed mean?' with no model", async () => {
    const ctx = buildAssistantContext(input("OWNER", "What does Confirmed mean?"));
    const r = await composeChat({ actor: { name: "Meera Kulkarni", role: "OWNER" }, input: { page: "dashboard", message: "What does Confirmed mean?", history: [] }, ctx, people, projectName: "FestFlow", engines: [] });
    expect(r.engine).toBe("offline");
    expect(r.text).toMatch(/two or more independent sources/);
  });
});

describe("testimony provenance", () => {
  it("labels assisted testimony with the confirming persona, and nothing else", () => {
    expect(provenanceLabel({ draftedWithAssistant: true, confirmedBy: "Meera Kulkarni" })).toBe("Drafted with assistant, confirmed by Meera Kulkarni");
    expect(provenanceLabel({ followUpId: "fu_1" })).toBeNull();
    expect(provenanceLabel({})).toBeNull();
    expect(provenanceLabel(null)).toBeNull();
  });
});
