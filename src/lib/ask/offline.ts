// Offline "Ask the handover" answer (no model): one templated line plus the top 3 exact quotes,
// each cited. Built only from retrieved, allowed sources, so it passes the validator by construction.
import { tokens, type Scored } from "./retrieve";
import type { AskDoc } from "./types";

export type NumberedDoc = { n: number; doc: AskDoc };

/** The sentence of `text` that shares the most terms with the question. */
export function bestSentence(text: string, query: string): string {
  const q = new Set(tokens(query));
  const parts = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12 && s.length <= 320);
  let best = parts[0] ?? text.slice(0, 240).trim();
  let bestHits = -1;
  for (const p of parts) {
    // A question line ("Q9: ...?") is never the answer to a question.
    const hits = tokens(p).filter((t) => q.has(t)).length * (p.endsWith("?") ? 0.3 : 1);
    if (hits > bestHits) {
      best = p;
      bestHits = hits;
    }
  }
  return best;
}

export function offlineSentences(
  query: string,
  ranked: Scored[],
  numbered: Map<string, number>,
  where: string,
): { text: string; cites: number[]; quote: string }[] {
  // Best matches first across facts and excerpts; drop weak matches (less than half the best coverage).
  const pool = ranked.filter((s) => numbered.has(s.doc.id)).sort((a, b) => b.coverage - a.coverage || b.score - a.score);
  const floor = (pool[0]?.coverage ?? 0) / 2;
  const picked = pool.filter((s) => s.coverage >= floor && s.coverage > 0).slice(0, 3);
  if (!picked.length) return [];
  const lines = picked.map((s) => {
    const d = s.doc;
    const quote = d.kind === "claim" ? (d.quotes?.find((q) => q.length >= 12) ?? bestSentence(d.text, query)) : bestSentence(d.text, query);
    return { text: `${d.label}: “${quote}”`, cites: [numbered.get(d.id)!], quote };
  });
  const head = {
    text: `${picked.length} record${picked.length === 1 ? "" : "s"} in the ${where} match${picked.length === 1 ? "es" : ""} your question (exact quotes, no AI summary):`,
    cites: lines.flatMap((l) => l.cites),
    quote: "",
  };
  return [head, ...lines];
}
