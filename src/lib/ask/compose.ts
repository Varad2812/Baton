// "Ask the handover": DB-free answer composition (unit-testable with fake engines).
//   corpus (already persona-filtered) -> BM25 retrieval -> known-gap / not-found refusal ->
//   engine chain (Groq, Gemini, offline extractive) -> citation validator -> canary + hidden-quote
//   scan -> redaction -> answer. Nothing outside the numbered, allowed sources can reach the reader.
import { z } from "zod";
import type { Role } from "@/generated/prisma/enums";
import { runChain, type ChatEngine } from "@/lib/assistant/engines";
import { scanForLeaks } from "@/lib/handover/compile";
import { Redactor } from "@/lib/pipeline/normalise";
import { bestSentence, offlineSentences } from "./offline";
import { answerable, bm25, retrieve, type Scored } from "./retrieve";
import { NOT_IN_DRAFT, NOT_IN_HANDOVER, type AskAnswer, type AskCorpus, type AskDoc, type AskSource } from "./types";
import { validateSentences, type RawSentence } from "./validate";

const AnswerSchema = z.object({
  answerable: z.boolean(),
  sentences: z
    .array(z.object({ text: z.string().max(600), cites: z.array(z.number().int()).max(6), quote: z.string().max(400).optional() }))
    .max(6)
    .default([]),
});
type RawAnswer = z.infer<typeof AnswerSchema>;

const SYSTEM = `You answer one question about a project handover, for a reader with a fixed access level.
Use ONLY the numbered SOURCES. Never use outside knowledge, never guess, never fill gaps.
Return JSON. If the sources do not answer the question, set answerable to false and return no sentences.
Otherwise write 1 to 4 short plain-English sentences (no markdown, no emoji, no ids). Each sentence lists in "cites" the
numbers of the sources it relies on. If you repeat words from a source in quotation marks, copy them exactly and also put
them in "quote". Describe facts graded "AI inference" as unconfirmed, "Conflicting" as disputed, and testimony as what the
departing owner said.`;

const GRADE_WORD: Record<string, string> = {
  VERIFIED: "Confirmed",
  SINGLE_SOURCE: "Single source",
  INFERRED: "AI inference",
  CONFLICTING: "Conflicting",
  MISSING: "Missing",
};

const redactor = () => new Redactor("ask_");
const clean = (s: string) => redactor().redact(s, null).text;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export type ComposeInput = {
  question: string;
  corpus: AskCorpus;
  role: Role;
  engines: ChatEngine[];
  offlineOnly?: boolean;
};

function refusal(c: AskCorpus, reason: NonNullable<AskAnswer["reason"]>, extra: Partial<AskAnswer> = {}): AskAnswer {
  const base = c.mode === "approved" ? NOT_IN_HANDOVER : NOT_IN_DRAFT;
  const text =
    reason === "gap"
      ? `${base} It is listed as a known gap: nobody has written it down yet.`
      : reason === "leak"
        ? `${base} I can only answer from what your access level may see.`
        : base;
  return {
    status: "refused",
    reason,
    text,
    sentences: [],
    sources: [],
    mode: c.mode,
    version: c.version,
    approvedBy: c.approvedBy,
    engine: "offline",
    model: null,
    askOwner: { first: c.owner.first, allowed: c.canAskOwner },
    stats: { proposed: 0, kept: 0, dropped: 0, citations: 0, validCitations: 0 },
    ...extra,
  };
}

export async function composeAnswer(o: ComposeInput): Promise<AskAnswer> {
  const { corpus, question } = o;
  const r = retrieve(question, corpus);

  // A question whose best match is a known gap ("No record: who holds the DB password") is not answerable.
  const gap = r.claims[0]?.doc.grade === "MISSING" ? r.claims[0] : null;
  const usable = (s: Scored) => s.doc.grade !== "MISSING";
  const claims = r.claims.filter(usable);
  const chunks = r.chunks;
  const strongest = [...claims, ...chunks].reduce((m, s) => Math.max(m, s.coverage), 0);
  if (gap && gap.coverage >= strongest) {
    return refusal(corpus, "gap", { gap: { title: gap.doc.title, claimId: gap.doc.claimId } });
  }
  if (!answerable({ ...r, claims })) return refusal(corpus, "not_found");

  // Number the allowed sources: facts first, then excerpts.
  // Number actual quotes independently. The label, excerpt and drawer target travel together.
  const receipts = claims.flatMap(({ doc }) => {
    if (!doc.evidence) return [doc]; // non-database callers
    return doc.evidence.map((e, index) => ({
      ...doc, id: doc.id + ":receipt:" + index, label: e.label, text: e.quote,
      quotes: [e.quote], chunkIds: [e.chunkId],
    }));
  });
  const rankedReceipts = bm25(question, receipts).sort((a, b) => b.score - a.score);
  const docs: AskDoc[] = [...rankedReceipts.map(s => s.doc), ...chunks.map(s => s.doc)];
  const numbered = new Map<string, number>();
  const byN = new Map<number, AskDoc>();
  docs.forEach((d, i) => {
    numbered.set(d.id, i + 1);
    byN.set(i + 1, d);
  });

  const where = corpus.mode === "approved" ? `approved handover (v${corpus.version})` : "draft handover";
  const prompt = [
    `READER ROLE: ${o.role}. HANDOVER: ${where}.`,
    "",
    "SOURCES:",
    ...docs.map((d, i) =>
      d.kind === "claim"
        ? `[${i + 1}] FACT (${GRADE_WORD[d.grade ?? ""] ?? "fact"}${d.fromTestimony ? ", testimony" : ""}; ${d.section}): ${clip(d.text, 700)}`
        : `[${i + 1}] EXCERPT from ${d.label}${d.afterApproval ? " (testimony recorded after approval)" : ""}: ${clip(d.text, 900)}`,
    ),
    "",
    `QUESTION: ${question}`,
  ].join("\n");

  const exactReceipts = rankedReceipts.filter(s => s.doc.evidence && s.score > 0);
  const offlinePool = exactReceipts.length
    ? [...exactReceipts, ...chunks.filter(s => s.doc.afterApproval)]
    : [...rankedReceipts, ...chunks];
  const offline = (): RawAnswer => ({ answerable: true, sentences: offlineSentences(question, offlinePool, numbered, where) });
  const chain = await runChain<RawAnswer>({
    engines: o.engines,
    system: SYSTEM,
    prompt,
    schema: AnswerSchema as unknown as z.ZodType<RawAnswer>,
    offline,
    offlineOnly: o.offlineOnly,
    temperature: 0.1,
  });

  const sourceText = new Map([...byN].map(([n, d]) => [n, { text: d.text }]));
  let engine = chain.engine;
  let model = chain.model;
  let raw = chain.value;
  if (!raw.answerable && engine !== "offline") return refusal(corpus, "not_found", { engine, model });
  let v = validateSentences(raw.sentences as RawSentence[], sourceText);
  const proposed = raw.sentences.length;
  let dropped = v.dropped.length;
  // A model answer that loses every sentence to the validator falls back to exact quotes.
  if (!v.kept.length && engine !== "offline") {
    raw = offline();
    v = validateSentences(raw.sentences as RawSentence[], sourceText);
    engine = "offline";
    model = null;
  }
  if (!v.kept.length) return refusal(corpus, "not_found", { engine, model });

  const cited = [...new Set(v.kept.flatMap((s) => s.cites))].sort((a, b) => a - b);
  const sources: AskSource[] = cited.map((n) => {
    const d = byN.get(n)!;
    return {
      n,
      kind: d.kind,
      id: d.id,
      claimId: d.claimId,
      title: clip(d.title, 160),
      label: d.label,
      grade: d.grade,
      excerpt: clip(d.kind === "claim" ? (d.quotes?.[0] ?? d.text) : bestSentence(d.text, v.kept.filter(s => s.cites.includes(n)).map(s => s.text).join(" ") || question), 320),
      afterApproval: d.afterApproval,
    };
  });
  const sentences = v.kept.map((s) => ({ text: clean(s.text), cites: s.cites }));
  const stats = { proposed, kept: sentences.length, dropped, citations: v.citations, validCitations: v.validCitations };

  if (corpus.forbidden.length && scanForLeaks({ sentences, sources }, corpus.forbidden).length) {
    return refusal(corpus, "leak", { engine, model, stats: { ...stats, kept: 0 } });
  }
  dropped = stats.dropped;
  return {
    status: "answered",
    text: sentences.map((s) => s.text).join(" "),
    sentences,
    sources: sources.map((s) => ({ ...s, title: clean(s.title), excerpt: clean(s.excerpt) })),
    mode: corpus.mode,
    version: corpus.version,
    approvedBy: corpus.approvedBy,
    engine,
    model,
    askOwner: { first: corpus.owner.first, allowed: corpus.canAskOwner },
    stats: { ...stats, dropped },
  };
}
