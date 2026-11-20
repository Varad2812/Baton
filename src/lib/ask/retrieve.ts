// "Ask the handover" retrieval (pure). BM25 keyword ranking over the facts and source excerpts the
// viewer may see, with topic boosts: a question that names a fact's topic lifts that fact, and the
// excerpts a strongly matching fact cites are lifted with it. No embeddings, no extra infrastructure.
import { stem } from "@/lib/assistant/match";
import type { AskCorpus, AskDoc } from "./types";

const STOP = new Set(
  "a an and are as at be been by can could did do does for from get got had has have how i if in into is it its me my of on or our please should show so tell than that the their them then there these they this those to us was we were use uses using now currently current service what whats when where which who whom why will with would you your about any anything after before".split(
    " ",
  ),
);

export function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[’']/g, "")
    .split(/[^a-z0-9₹$]+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map(w => w === "authentication" || w === "authn" ? "auth" : stem(w));
}

export type Scored = { doc: AskDoc; score: number; coverage: number };

const K1 = 1.2;
const B = 0.75;

/** Plain BM25 over `docs` for `query`. `coverage` = share of distinct query terms the doc contains. */
export function bm25(query: string, docs: AskDoc[]): Scored[] {
  const q = [...new Set(tokens(query))];
  if (!q.length || !docs.length) return [];
  const toks = docs.map((d) => tokens(`${d.title} ${d.text}`));
  const avg = toks.reduce((n, t) => n + t.length, 0) / docs.length || 1;
  const df = new Map<string, number>();
  for (const t of toks) for (const w of new Set(t)) df.set(w, (df.get(w) ?? 0) + 1);
  const N = docs.length;
  return docs.map((doc, i) => {
    const tf = new Map<string, number>();
    for (const w of toks[i]) tf.set(w, (tf.get(w) ?? 0) + 1);
    let score = 0;
    let hit = 0;
    for (const w of q) {
      const f = tf.get(w) ?? 0;
      if (!f) continue;
      hit++;
      const n = df.get(w) ?? 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      score += idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * toks[i].length) / avg)));
    }
    return { doc, score, coverage: hit / q.length };
  });
}

export type Retrieval = { claims: Scored[]; chunks: Scored[]; terms: string[] };

export const TOP_CHUNKS = 8;
export const TOP_CLAIMS = 6;

/**
 * Rank facts and excerpts. Topic boost: a fact whose topic key / section shares a term with the
 * question scores x1.5; each excerpt cited by a matching fact gets +40% of that fact's score.
 */
export function retrieve(query: string, corpus: Pick<AskCorpus, "claims" | "chunks">, opts: { topChunks?: number; topClaims?: number } = {}): Retrieval {
  const terms = [...new Set(tokens(query))];
  const historical = /\b(previous(?:ly)?|original(?:ly)?|before|history|historical|used to|switch|migrat\w*|chang\w*|replac\w*|at first)\b/i.test(query);
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const month = months.findIndex(m => new RegExp("\\b" + m + "[a-z]*\\b", "i").test(query));
  const year = query.match(/\b(20\d{2})\b/)?.[1];
  const byId = new Map(corpus.claims.map(c => [c.id, c]));
  const successors = new Set(corpus.claims.map(c => c.replacedBy).filter(Boolean));
  const eligible = corpus.claims.filter(c => {
    if (!c.replacedBy && !successors.has(c.id)) return true;
    if (month < 0) return historical || !c.replacedBy;
    const anchor = year ?? c.date?.slice(0, 4);
    if (!anchor) return true;
    const asOf = anchor + "-" + String(month + 1).padStart(2, "0");
    const until = c.replacedBy ? byId.get(c.replacedBy)?.date : null;
    return (!c.date || c.date.slice(0, 7) <= asOf) && (!until || until.slice(0, 7) > asOf);
  });
  const decisionMatches = eligible.filter(c => (c.replacedBy || successors.has(c.id)) &&
    tokens((c.topicKey ?? c.title).replace(/[_:]/g, " ")).some(t => terms.includes(t) && !["provider","decision"].includes(t)));
  const selected = decisionMatches.length ? decisionMatches : eligible;
  const eligibleIds = new Set(selected.map(c => c.id));
  const selectedChunks = new Set(selected.flatMap(c => c.chunkIds ?? []));
  const claimScores = bm25(query, selected).map((s) => {
    const topic = tokens(`${s.doc.topicKey?.replace(/[_:]/g, " ") ?? ""} ${s.doc.section ?? ""}`);
    const boosted = topic.some((t) => terms.includes(t)) ? s.score * 1.5 : s.score;
    return { ...s, score: boosted };
  });
  const lift = new Map<string, number>();
  for (const s of claimScores) {
    if (s.score <= 0) continue;
    for (const id of s.doc.chunkIds ?? []) lift.set(id, Math.max(lift.get(id) ?? 0, s.score * 0.4));
  }
  const chunkScores = bm25(query, corpus.chunks.filter(c => c.afterApproval || (decisionMatches.length ? selectedChunks.has(c.id) && eligibleIds.has(c.claimId) : !byId.has(c.claimId) || eligibleIds.has(c.claimId)))).map((s) => ({ ...s, score: s.score + (lift.get(s.doc.id) ?? 0) }));
  const byScore = (a: Scored, b: Scored) => b.score - a.score || a.doc.id.localeCompare(b.doc.id);
  return {
    claims: claimScores.filter((s) => s.score > 0).sort(byScore).slice(0, opts.topClaims ?? TOP_CLAIMS),
    chunks: chunkScores.filter((s) => s.score > 0).sort(byScore).slice(0, opts.topChunks ?? TOP_CHUNKS),
    terms,
  };
}

/** Is the best match good enough to answer from? (At least half of the question's terms, or two.) */
export function answerable(r: Retrieval): boolean {
  const best = [...r.claims, ...r.chunks].sort((a, b) => b.coverage - a.coverage)[0];
  if (!best || !r.terms.length) return false;
  const hits = Math.round(best.coverage * r.terms.length);
  return best.coverage >= 0.5 || hits >= 2;
}
