// docs/assistant-knowledge.md: the assistant's product knowledge. The whole file goes into the model
// prompt; its "## FAQ" section is parsed into entries for the offline matcher.
import { readFileSync } from "node:fs";
import path from "node:path";

export type FaqEntry = { question: string; answer: string; keywords: string[] };
export type Knowledge = { text: string; faq: FaqEntry[] };

export const KNOWLEDGE_PATH = path.join(process.cwd(), "docs", "assistant-knowledge.md");

/** Parse the FAQ section: "### Question" + optional "<!-- keywords: a, b -->" + answer paragraph(s). */
export function parseFaq(md: string): FaqEntry[] {
  const start = md.search(/^## FAQ\s*$/m);
  if (start < 0) return [];
  const rest = md.slice(start).replace(/^## FAQ\s*$/m, "");
  const end = rest.search(/^## /m);
  const body = end < 0 ? rest : rest.slice(0, end);
  const out: FaqEntry[] = [];
  for (const block of body.split(/^### /m).slice(1)) {
    const [head, ...lines] = block.split("\n");
    let keywords: string[] = [];
    const answer: string[] = [];
    for (const l of lines) {
      const k = l.match(/^<!--\s*keywords:\s*(.*?)\s*-->/i);
      if (k) keywords = k[1].split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
      else answer.push(l);
    }
    const a = answer.join(" ").replace(/\s+/g, " ").trim();
    if (head.trim() && a) out.push({ question: head.trim(), answer: a, keywords });
  }
  return out;
}

/** The text sent to models: everything except HTML comments (keyword hints are for the offline matcher). */
export function promptText(md: string): string {
  return md.replace(/<!--[\s\S]*?-->\n?/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

let memo: Knowledge | null = null;

export function loadKnowledge(): Knowledge {
  if (memo) return memo;
  let md = "";
  try {
    md = readFileSync(KNOWLEDGE_PATH, "utf8");
  } catch {
    md = "# Baton\nBaton turns a project's records into a checked, role-safe handover.";
  }
  memo = { text: promptText(md), faq: parseFaq(md) };
  return memo;
}

/* ------------------------------------------------------------------------- */
/* Per-question excerpt (keeps prompts small enough for free-tier rate limits) */
/* ------------------------------------------------------------------------- */

export function sections(md: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const block of md.split(/^## /m).slice(1)) {
    const nl = block.indexOf("\n");
    out.set(block.slice(0, nl).trim(), block.slice(nl + 1).trim());
  }
  return out;
}

const PAGE_HINT: Record<string, RegExp> = {
  landing: /Landing page/,
  new: /New project/,
  dashboard: /\*\*Home\*\*/,
  insights: /\*\*Insights\*\*/,
  radar: /\*\*Knowledge at risk\*\*/,
  sources: /\*\*Sources\*\*/,
  ledger: /\*\*Facts\*\*/,
  conflicts: /\*\*Conflicts\*\*/,
  interview: /\*\*Questions for/,
  review: /\*\*Review & approve\*\*/,
  handover: /handover\*\*/,
  ask: /\*\*Ask the handover\*\*/,
  trust: /\*\*Safety checks\*\*/,
};

let rawMemo: string | null = null;
function rawKnowledge(): string {
  if (rawMemo !== null) return rawMemo;
  try {
    rawMemo = readFileSync(KNOWLEDGE_PATH, "utf8");
  } catch {
    rawMemo = "";
  }
  return rawMemo;
}

/**
 * The part of the knowledge base sent with one question: what Baton is, the grades, roles, the
 * current page's description, the best-matching FAQ entries, and the judging guide when asked.
 */
export function knowledgeFor(question: string, page: string, score: (q: string, e: FaqEntry) => number, maxFaq = 5): string {
  const md = rawKnowledge();
  if (!md) return loadKnowledge().text;
  const s = sections(md);
  const parts: string[] = [];
  for (const name of ["What Baton is", "Grades in plain words", "Roles and permissions"]) if (s.has(name)) parts.push(`## ${name}\n${s.get(name)}`);
  const pages = s.get("Pages") ?? "";
  const hint = PAGE_HINT[page];
  const pageLine = hint ? pages.split(/\n(?=- )/).find((l) => hint.test(l)) : undefined;
  if (pageLine) parts.push(`## Current page\n${pageLine.trim()}`);
  if (/judge|start|begin|guide|tour|demo|workflow|steps?|how does it work|pipeline/i.test(question)) {
    for (const name of ["The workflow", "Start here guide", "How to judge in 60 seconds"]) if (s.has(name)) parts.push(`## ${name}\n${s.get(name)}`);
  }
  if (/page|where|which screen|navigate|find/i.test(question) && pages) parts.push(`## Pages\n${pages}`);
  const faq = loadKnowledge().faq;
  const top = faq
    .map((e) => ({ e, v: score(question, e) }))
    .sort((a, b) => b.v - a.v)
    .slice(0, maxFaq)
    .filter((x) => x.v > 0);
  if (top.length) parts.push(`## Relevant FAQ\n${top.map((x) => `Q: ${x.e.question}\nA: ${x.e.answer}`).join("\n\n")}`);
  if (s.has("Limitations")) parts.push(`## Limitations\n${s.get("Limitations")}`);
  return promptText(parts.join("\n\n"));
}
