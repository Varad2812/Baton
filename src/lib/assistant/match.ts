// Offline matching: keyword + fuzzy scoring of a question against FAQ entries and fact titles.
// Pure, no network, no DB.
import type { FaqEntry } from "./knowledge";

const STOP = new Set(
  "a an and are as at be by can could did do does doing for from get got has have how i if in is it its me mean means meaning my of on or please show tell that the this to was we what whats when where which who why will with would you your about there here just".split(
    " ",
  ),
);

/** Grade words people actually type, mapped onto the words the knowledge base uses. */
const SYNONYMS: Record<string, string> = {
  verified: "confirmed",
  verify: "confirmed",
  inferred: "inference",
  infer: "inference",
  guess: "inference",
  contradiction: "conflicting",
  contradicts: "conflicting",
  conflict: "conflicting",
  conflicts: "conflicting",
  disagree: "conflicting",
  gap: "missing",
  gaps: "missing",
  signoff: "approve",
  approval: "approve",
  approved: "approve",
  successor: "handover",
  leaks: "leak",
  leakage: "leak",
  redacted: "redact",
  redaction: "redact",
  redactions: "redact",
};

export function stem(w: string): string {
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ed")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

export function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[’']/g, "")
    .split(/[^a-z0-9+]+/)
    .filter((w) => w && !STOP.has(w))
    .map((w) => stem(SYNONYMS[w] ?? w));
}

/** Edit distance with adjacent transpositions (optimal string alignment), capped at cap+1. */
export function editDistance(a: string, b: string, cap = 2): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > cap) return cap + 1;
  }
  return Math.min(d[a.length][b.length], cap + 1);
}

/** 1 for an exact match, 0.8 for a one-typo match on words of 5+ letters, else 0. */
function wordHit(q: string, vocab: Set<string>): number {
  if (vocab.has(q)) return 1;
  if (q.length < 5) return 0;
  for (const v of vocab) if (v.length >= 5 && editDistance(q, v, 1) <= 1) return 0.8;
  return 0;
}

export type FaqMatch = { entry: FaqEntry; score: number };

/**
 * Score = weighted share of the question's words found in the entry (keywords 3, question 2,
 * answer 0.5), plus a bonus for each multi-word keyword phrase that appears verbatim.
 */
export function scoreFaq(question: string, entry: FaqEntry): number {
  const q = words(question);
  if (!q.length) return 0;
  const kw = new Set(entry.keywords.flatMap((k) => words(k)));
  const qs = new Set(words(entry.question));
  const ans = new Set(words(entry.answer));
  let s = 0;
  for (const w of q) s += Math.max(3 * wordHit(w, kw), 2 * wordHit(w, qs), 0.5 * wordHit(w, ans));
  const lower = question.toLowerCase();
  for (const k of entry.keywords) if (k.includes(" ") && lower.includes(k)) s += 2;
  return s / Math.sqrt(q.length);
}

export const FAQ_THRESHOLD = 2.2;

export function matchFaq(question: string, faq: FaqEntry[], threshold = FAQ_THRESHOLD): FaqMatch | null {
  let best: FaqMatch | null = null;
  for (const entry of faq) {
    const score = scoreFaq(question, entry);
    if (!best || score > best.score) best = { entry, score };
  }
  return best && best.score >= threshold ? best : null;
}

/** Relevance of a text (fact title + statement) to a question: shared content words, typo-tolerant. */
export function overlapScore(question: string, text: string): number {
  const q = [...new Set(words(question))].filter((w) => w.length >= 3);
  if (!q.length) return 0;
  const vocab = new Set(words(text));
  let s = 0;
  for (const w of q) s += wordHit(w, vocab);
  return s / q.length;
}
