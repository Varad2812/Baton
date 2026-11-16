// Starter questions for "Ask the handover", written from the project's own facts (never hardcoded).
import type { AskDoc } from "./types";

const topic = (title: string) =>
  title
    .split(/[:—–(]| - /)[0]
    .replace(/^(no record|missing)\s*/i, "")
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .join(" ")
    .toLowerCase();

export function suggestionsFor(claims: AskDoc[]): string[] {
  const out: string[] = [];
  const decision = claims.find((c) => c.section === "Decisions" && c.grade !== "MISSING" && c.grade !== "CONFLICTING") ?? claims.find((c) => c.grade === "VERIFIED");
  if (decision) out.push(`What was decided about ${topic(decision.title)}, and why?`);
  if (claims.some((c) => c.section === "Risks" || /risk/i.test(c.title))) out.push("What are the biggest risks right now?");
  else if (claims.some((c) => c.section === "Deadlines")) out.push("What are the upcoming deadlines?");
  const gap = claims.find((c) => c.grade === "MISSING");
  if (gap) {
    const q = gap.title.replace(/^no record:\s*/i, "").replace(/\.$/, "").trim();
    out.push(/^(who|what|where|when|how|which)\b/i.test(q) ? `${q[0].toUpperCase()}${q.slice(1)}?` : `Who knows about ${topic(gap.title)}?`);
  }
  return out.slice(0, 3);
}
