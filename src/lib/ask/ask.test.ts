import { beforeEach, describe, expect, it } from "vitest";
import { resetEngineState, type ChatEngine } from "@/lib/assistant/engines";
import { composeAnswer } from "./compose";
import { answerable, bm25, retrieve } from "./retrieve";
import { suggestionsFor } from "./suggest";
import type { AskCorpus, AskDoc } from "./types";
import { validateSentences } from "./validate";

const fact = (id: string, title: string, statement: string, quotes: string[], extra: Partial<AskDoc> = {}): AskDoc => ({
  id,
  kind: "claim",
  title,
  text: [`${title}. ${statement}`, ...quotes].join("\n"),
  label: `src ${id}`,
  claimId: id,
  grade: "VERIFIED",
  section: "Decisions",
  topicKey: id,
  chunkIds: [`chk_${id}`],
  quotes,
  ...extra,
});
const excerpt = (id: string, text: string, claimId: string): AskDoc => ({ id, kind: "chunk", title: "notes", text, label: `notes ${id}`, claimId });

const corpus = (over: Partial<AskCorpus> = {}): AskCorpus => ({
  mode: "approved",
  version: 1,
  approvedBy: "Prof. S. Rao",
  claims: [
    fact("pay", "Payment gateway: Razorpay", "Notes of 2 Apr chose Razorpay for the lower setup fee.", ["Final: go with Razorpay, lower setup fee"]),
    fact("auth", "Auth moved from Firebase to Supabase", "Supabase replaced Firebase on 12 Mar after the free tier hit limits.", ["moved auth to Supabase"]),
    fact("dbpw", "No record: who holds the production database password", "Nobody wrote down who holds it.", [], { grade: "MISSING", section: "Access & secrets", topicKey: "gap:credentials_owner" }),
  ],
  chunks: [excerpt("chk_pay", "2 Apr notes. Final: go with Razorpay, lower setup fee. Arjun to set up test mode.", "pay")],
  forbidden: ["CANARY-RM-7F3A"],
  hiddenCount: 2,
  owner: { first: "Meera", full: "Meera Kulkarni" },
  canAskOwner: true,
  ...over,
});

/** A fake model engine that returns `json` for every request. */
const fakeEngine = (json: unknown): ChatEngine => ({ name: "groq", model: "fake", transport: async () => JSON.stringify(json) });

beforeEach(() => resetEngineState());

describe("citation validator", () => {
  const sources = new Map([
    [1, { text: "Final: go with Razorpay, lower setup fee" }],
    [2, { text: "Supabase replaced Firebase" }],
  ]);
  it("keeps cited sentences and strips inline [n] markers", () => {
    const v = validateSentences([{ text: "Razorpay was chosen [1].", cites: [1] }], sources);
    expect(v.kept).toEqual([{ text: "Razorpay was chosen.", cites: [1] }]);
    expect(v.validCitations).toBe(1);
  });
  it("drops a sentence with no citation", () => {
    const v = validateSentences([{ text: "It was cheaper.", cites: [] }], sources);
    expect(v.kept).toHaveLength(0);
    expect(v.dropped[0].reason).toBe("uncited");
  });
  it("drops a sentence citing a source outside the allowed set", () => {
    const v = validateSentences([{ text: "The sponsor paid it.", cites: [1, 9] }], sources);
    expect(v.kept).toHaveLength(0);
    expect(v.dropped[0].reason).toBe("unknown_citation");
  });
  it("drops a sentence whose quoted words are not in a cited source", () => {
    const quoted = validateSentences([{ text: 'The notes say "go with PhonePe for launch".', cites: [1] }], sources);
    expect(quoted.dropped[0]?.reason).toBe("quote_mismatch");
    const field = validateSentences([{ text: "Razorpay was chosen.", cites: [2], quote: "go with Razorpay" }], sources);
    expect(field.dropped[0]?.reason).toBe("quote_mismatch");
    const ok = validateSentences([{ text: "The notes say “go with Razorpay, lower setup fee”.", cites: [1] }], sources);
    expect(ok.kept).toHaveLength(1);
  });
});

describe("retrieval", () => {
  it("ranks the matching fact first and lifts the excerpt it cites", () => {
    const r = retrieve("Which payment gateway did we pick?", corpus());
    expect(r.claims[0].doc.id).toBe("pay");
    expect(r.chunks[0].doc.id).toBe("chk_pay");
    expect(answerable(r)).toBe(true);
  });
  it("is not answerable when nothing shares the question's terms", () => {
    expect(answerable(retrieve("What colour is the stage curtain?", corpus()))).toBe(false);
  });
  it("bm25 scores zero for documents without query terms", () => {
    expect(bm25("curtain", corpus().claims).every((s) => s.score === 0)).toBe(true);
  });
  it("suggests questions from the project's own facts", () => {
    const s = suggestionsFor(corpus().claims);
    expect(s[0]).toBe("What do the records say about “Payment gateway”?");
    expect(s.at(-1)).toMatch(/^Who holds the production database password\?$/);
  });
});

describe("composeAnswer", () => {
  it("answers offline with exact, cited quotes", async () => {
    const a = await composeAnswer({ question: "Which payment gateway was chosen?", corpus: corpus(), role: "INCOMING", engines: [] });
    expect(a.status).toBe("answered");
    expect(a.engine).toBe("offline");
    expect(a.sentences.every((s) => s.cites.length > 0)).toBe(true);
    expect(a.text).toContain("go with Razorpay, lower setup fee");
    expect(a.sources.map((s) => s.claimId)).toContain("pay");
  });

  it("refuses with 'not in the approved handover' when nothing matches", async () => {
    const a = await composeAnswer({ question: "What colour is the stage curtain?", corpus: corpus(), role: "INCOMING", engines: [] });
    expect(a.status).toBe("refused");
    expect(a.reason).toBe("not_found");
    expect(a.text).toBe("This isn't in the approved handover.");
    expect(a.askOwner).toEqual({ first: "Meera", allowed: true });
  });

  it("refuses a question that hits a known gap and points at it", async () => {
    const a = await composeAnswer({ question: "Who holds the production database password?", corpus: corpus(), role: "INCOMING", engines: [] });
    expect(a.status).toBe("refused");
    expect(a.reason).toBe("gap");
    expect(a.gap?.claimId).toBe("dbpw");
  });

  it("labels draft answers", async () => {
    const a = await composeAnswer({ question: "What was decided about the payment gateway?", corpus: corpus({ mode: "draft", version: null, approvedBy: null }), role: "OWNER", engines: [] });
    expect(a.mode).toBe("draft");
    const r = await composeAnswer({ question: "stage curtain colour?", corpus: corpus({ mode: "draft", version: null }), role: "OWNER", engines: [] });
    expect(r.text).toBe("This isn't in the draft handover.");
  });

  it("removes model sentences with bad citations and keeps the valid ones", async () => {
    const engine = fakeEngine({
      answerable: true,
      sentences: [
        { text: "Razorpay was chosen for its lower setup fee.", cites: [1] },
        { text: "The treasurer also approved a sponsor deal.", cites: [] },
        { text: "PhonePe was the final pick.", cites: [42] },
      ],
    });
    const a = await composeAnswer({ question: "Which payment gateway was chosen?", corpus: corpus(), role: "INCOMING", engines: [engine] });
    expect(a.engine).toBe("groq");
    expect(a.sentences).toEqual([{ text: "Razorpay was chosen for its lower setup fee.", cites: [1] }]);
    expect(a.stats).toMatchObject({ proposed: 3, kept: 1, dropped: 2 });
  });

  it("falls back to exact quotes when the model cites nothing valid", async () => {
    const engine = fakeEngine({ answerable: true, sentences: [{ text: "Made up.", cites: [99] }] });
    const a = await composeAnswer({ question: "Which payment gateway was chosen?", corpus: corpus(), role: "INCOMING", engines: [engine] });
    expect(a.status).toBe("answered");
    expect(a.engine).toBe("offline");
  });

  it("turns an answer carrying a canary or hidden quote into a refusal", async () => {
    const leaky = corpus({
      chunks: [excerpt("chk_pay", "Final: go with Razorpay, lower setup fee. Budget ref CANARY-RM-7F3A.", "pay")],
    });
    const engine = fakeEngine({ answerable: true, sentences: [{ text: "Razorpay was chosen, ref CANARY-RM-7F3A.", cites: [1] }] });
    const a = await composeAnswer({ question: "Which payment gateway was chosen?", corpus: leaky, role: "OBSERVER", engines: [engine] });
    expect(a.status).toBe("refused");
    expect(a.reason).toBe("leak");
    expect(JSON.stringify(a)).not.toContain("CANARY-RM-7F3A");
  });

  it("an engine that echoes every source cannot cite anything outside the corpus", async () => {
    const engine = fakeEngine({ answerable: true, sentences: [{ text: "Sponsor phone is in the restricted budget sheet.", cites: [7] }] });
    const a = await composeAnswer({ question: "Which payment gateway was chosen?", corpus: corpus(), role: "OBSERVER", engines: [engine] });
    expect(a.text).not.toContain("Sponsor phone");
  });

  it("observers cannot ask the owner", async () => {
    const a = await composeAnswer({ question: "stage curtain colour?", corpus: corpus({ canAskOwner: false }), role: "OBSERVER", engines: [] });
    expect(a.askOwner.allowed).toBe(false);
  });
});
