// Starter questions for "Ask the handover", written from the project's own facts (never hardcoded).
import type { AskDoc } from "./types";

const head = (title: string) => title.split(/[:(]| — | – | - /)[0].trim();
const cap = (s: string) => `${s[0]?.toUpperCase() ?? ""}${s.slice(1)}`;

export function suggestionsFor(claims: AskDoc[]): string[] {
  const out: string[] = [];
  // A confirmed decision (latest first in the corpus order) -> ask what the records say about it.
  const decision =
    claims.find((c) => !c.replacedBy && c.section === "Decisions" && c.grade === "VERIFIED") ??
    claims.find((c) => c.grade === "VERIFIED" && c.section !== "Purpose & status");
  if (decision) out.push(`What do the records say about “${head(decision.title)}”?`);
  if (claims.some((c) => c.section === "Risks")) out.push("What are the biggest risks right now?");
  else if (claims.some((c) => c.section === "Deadlines")) out.push("What are the upcoming deadlines?");
  // A known gap phrased as the question it is (it will be refused, which shows the Ask-owner flow).
  const gap = claims.find((c) => c.grade === "MISSING" && /^no record\b/i.test(c.title));
  if (gap) {
    const q = gap.title.replace(/^no record(?:\s+of|:)?\s*/i, "").replace(/[.?]$/, "").trim();
    if (q) out.push(/^(who|what|where|when|how|which|whether)\b/i.test(q) ? `${cap(q)}?` : `Who knows about ${q}?`);
  }
  return out.slice(0, 3);
}
