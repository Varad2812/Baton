// Rule-based fallback (no network, always works). Used when no LLM engine is reachable:
// every claim quotes one exact line of a chunk, so the normal quote validator and grading apply.

import type { ClaimType } from "@/generated/prisma/enums";
import type { ExtractBatch, ExtractedClaim } from "./extract";
import type { PairLabel, ConflictPair } from "./conflicts";
import type { Section } from "./checklist";
import type { PChunk, PPerson } from "./types";

export const RULE_BASED = "rule-based";

type Rule = { type: ClaimType; re: RegExp; section: Section; checklist: string[] };

const RULES: Rule[] = [
  { type: "DECISION", re: /(decided|final:|we('| wi)ll use|going with|switched to|chose)/i, section: "Decisions", checklist: ["key_decisions"] },
  { type: "DEPENDENCY", re: /(depends on|waiting on|requires|vendor|api key)/i, section: "Vendors & dependencies", checklist: ["external_dependencies"] },
  { type: "TASK", re: /(todo|need to|will do|assigned|action item|- \[ \])/i, section: "Open work", checklist: ["open_work"] },
  { type: "RISK", re: /(blocked|risk|fails?\b|broken|bug|issue|\bdown\b)/i, section: "Risks", checklist: [] },
];

const CONTACT_RE = /(contact|reach|call|email)/i;

/** Subject keywords for topic keys (rule-based conflicts group on these). */
const TOPICS: [string, RegExp][] = [
  ["auth_provider", /\b(auth|login|firebase|supabase|clerk|oauth)\b/i],
  ["payment_gateway", /\b(payment|razorpay|phonepe|stripe|paytm|upi|gateway)\b/i],
  ["database", /\b(database|db|postgres|mysql|mongo|sqlite|supabase db)\b/i],
  ["hosting_deploy", /\b(deploy|hosting|render|vercel|netlify|heroku|aws|server)\b/i],
  ["email", /\b(email|smtp|mailgun|sendgrid|newsletter)\b/i],
  ["build", /\b(build|compile|windows|ci)\b/i],
  ["menu", /\b(menu|meal|food|mess)\b/i],
  ["billing", /\b(bill|billing|fee|invoice|budget|price|cost)\b/i],
  ["schedule", /\b(deadline|launch|release|due|schedule)\b/i],
  ["notifications", /\b(notification|push|sms|whatsapp)\b/i],
];

const STOP = new Set("the a an and or to of in on for with we will is are be it this that our use going".split(" "));

export function topicFor(line: string): string {
  for (const [k, re] of TOPICS) if (re.test(line)) return k;
  const w = line
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((x) => x.length > 3 && !STOP.has(x));
  return w[0] ? `misc_${w[0]}` : "misc";
}

/** Lines / sentences of a chunk, each an exact substring of the chunk text. */
export function splitLines(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\n+/)) {
    const t = line.trim();
    if (!t) continue;
    if (t.length <= 220) {
      out.push(t);
      continue;
    }
    // Long paragraph: split into sentences (still exact substrings).
    for (const m of t.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? []) {
      const s = m.trim();
      if (s) out.push(s.slice(0, 220).trim());
    }
  }
  return out;
}

const clean = (s: string) =>
  s
    .replace(/^[-*#>\s]+/, "")
    .replace(/^\[[ x]\]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();

const dedupeKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

function titleOf(line: string): string {
  const words = clean(line).split(" ");
  const t = words.slice(0, 8).join(" ");
  return (words.length > 8 ? `${t}…` : t).replace(/[.:;,]+$/, "").slice(0, 90);
}

function classify(line: string, people: PPerson[]): Rule | { type: ClaimType; section: Section; checklist: string[] } | null {
  for (const r of RULES) if (r.re.test(line)) return r;
  const mentionsPerson = people.some((p) => {
    const first = p.name.replace(/^Prof\.\s*/, "").split(/\s+/)[0];
    return (first && new RegExp(`\\b${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(line)) || p.handles.some((h) => h && line.includes(h));
  });
  if (mentionsPerson && CONTACT_RE.test(line)) return { type: "CONTACT", section: "Contacts", checklist: ["key_contacts"] };
  if (/\?\s*$/.test(line)) return { type: "QUESTION", section: "Open work", checklist: [] };
  return null;
}

function ownerName(author: string | null, people: PPerson[]): string {
  if (!author) return "";
  const a = author.replace(/^@/, "").toLowerCase();
  const p = people.find((x) => x.name.toLowerCase() === a || x.handles.some((h) => h.replace(/^@/, "").toLowerCase() === a) || x.email?.toLowerCase() === a);
  return p?.name ?? "";
}

/** Extract claims from the chunks of one batch. Dedupe near-identical lines (also across batches via `seen`). */
export function ruleExtract(chunks: PChunk[], people: PPerson[], seen: Set<string> = new Set()): ExtractedClaim[] {
  const out: ExtractedClaim[] = [];
  for (const c of chunks) {
    for (const line of splitLines(c.text)) {
      if (line.length < 12 || /\[REDACTED:/.test(line)) continue;
      const kind = classify(line, people);
      if (!kind) continue;
      const k = dedupeKey(line);
      if (seen.has(k)) continue;
      seen.add(k);
      const body = clean(line);
      out.push({
        type: kind.type,
        title: titleOf(line),
        statement: body.length > 300 ? `${body.slice(0, 297)}…` : body,
        topicKey: topicFor(line),
        section: kind.section,
        checklistKeys: kind.checklist,
        owner: ownerName(c.author, people),
        date: c.timestamp ? c.timestamp.slice(0, 10) : "",
        isInference: false,
        evidence: [{ chunkId: c.id, quote: line, relation: "SUPPORTS" }],
      });
    }
  }
  return out;
}

export function ruleExtractBatch(batch: ExtractBatch, chunksById: Map<string, PChunk>, people: PPerson[], seen: Set<string>): ExtractedClaim[] {
  const chunks = batch.chunkIds.map((id) => chunksById.get(id)).filter((c): c is PChunk => !!c);
  return ruleExtract(chunks, people, seen);
}

/** Rule-based conflict labels: two DECISIONs on the same topic keyword with different text -> CONTRADICTS. */
export function ruleLabelPairs(pairs: ConflictPair[]): PairLabel[] {
  const labels: PairLabel[] = [];
  pairs.forEach((p, i) => {
    if (p.a.type !== "DECISION" || p.b.type !== "DECISION") return;
    if (dedupeKey(p.a.statement) === dedupeKey(p.b.statement)) return;
    labels.push({ pair: i, label: "CONTRADICTS", note: `Two different recorded decisions on ${p.topicKey.replace(/_/g, " ")} (rule-based match).` });
  });
  return labels;
}
