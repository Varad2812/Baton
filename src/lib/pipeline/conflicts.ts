// Conflicts stage. Pure: candidate pairing + applying labels. LLM: labelPairs().
// SUPERSEDES (a later decision knowingly replaced an earlier one) is evolution, not a conflict:
// it is stored RESOLVED with resolution B and shown on the timeline.

import { z } from "zod";
import { llmJson, LlmInvalidOutputError, type LlmRunCtx } from "@/lib/llm";
import { supportingSources, type GradeLookup } from "./grade";
import type { IdGen } from "./ids";
import { sourceLabel } from "./labels";
import type { PClaim, PConflict } from "./types";

export type ConflictPair = { topicKey: string; a: PClaim; b: PClaim };

/** Best known date for a claim: its own date, else its earliest evidence timestamp. */
export function claimDate(c: PClaim, look: GradeLookup): string {
  if (c.date) return c.date;
  const ts = c.evidence
    .map((e) => look.chunks.get(e.chunkId)?.timestamp)
    .filter((t): t is string => !!t)
    .sort();
  return ts[0]?.slice(0, 10) ?? "";
}

/**
 * Topics with >= 2 eligible claims -> all pairs (A older than B). Eligible = has supporting
 * evidence, not MISSING, not REJECTED. At most `maxPerTopic` most recent claims per topic.
 */
export function pairCandidates(claims: PClaim[], look: GradeLookup, maxPerTopic = 5): ConflictPair[] {
  const byTopic = new Map<string, PClaim[]>();
  for (const c of claims) {
    if (c.status === "REJECTED" || c.grade === "MISSING" || c.topicKey.startsWith("gap:")) continue;
    if (!c.evidence.some((e) => e.quoteValid && e.relation === "SUPPORTS")) continue;
    const l = byTopic.get(c.topicKey) ?? [];
    l.push(c);
    byTopic.set(c.topicKey, l);
  }
  const pairs: ConflictPair[] = [];
  for (const [topicKey, list] of byTopic) {
    if (list.length < 2) continue;
    const sorted = list
      .map((c) => ({ c, d: claimDate(c, look) }))
      .sort((x, y) => x.d.localeCompare(y.d) || x.c.id.localeCompare(y.c.id))
      .slice(-maxPerTopic)
      .map((x) => x.c);
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) pairs.push({ topicKey, a: sorted[i], b: sorted[j] });
    }
  }
  return pairs;
}

export type PairLabel = { pair: number; label: "CONTRADICTS" | "SUPERSEDES" | "CONSISTENT"; note: string };

/** Turn labelled pairs into Conflict rows. CONSISTENT pairs produce nothing. */
export function applyLabels(pairs: ConflictPair[], labels: PairLabel[], ids: IdGen): PConflict[] {
  const out: PConflict[] = [];
  const done = new Set<string>();
  for (const l of labels) {
    const p = pairs[l.pair];
    if (!p || l.label === "CONSISTENT") continue;
    const k = `${p.a.id}|${p.b.id}`;
    if (done.has(k)) continue;
    done.add(k);
    out.push({
      id: ids("cf"),
      topicKey: p.topicKey,
      claimAId: p.a.id,
      claimBId: p.b.id,
      kind: l.label,
      status: l.label === "CONTRADICTS" ? "OPEN" : "RESOLVED",
      resolution: l.label === "SUPERSEDES" ? "B" : null,
      note: l.note.trim() || null,
    });
  }
  return out;
}

/* ------------------------------------------------------------------------- */
/* LLM                                                                        */
/* ------------------------------------------------------------------------- */

export const PairLabelsSchema = z.object({
  labels: z.array(
    z.object({
      pair: z.number().int(),
      label: z.enum(["CONTRADICTS", "SUPERSEDES", "CONSISTENT"]),
      note: z.string().describe("one short sentence explaining the label, citing dates"),
    }),
  ),
});

const PAIR_SYSTEM = `You compare pairs of claims about the same subject from a project's records.
Claim A is older than claim B. Label each pair:
- SUPERSEDES: B is a later change that knowingly replaced A (a migration, a revised decision), so A is
  simply out of date. This is evolution, not a conflict.
- CONTRADICTS: both cannot be true now and the records do not settle which one is current (e.g. an
  approved "final" decision followed by work on a different option without any recorded change of
  decision, or two different dates announced for the same deadline).
- CONSISTENT: compatible, complementary or about different aspects.
Consider the dates and whether a source is authoritative (approved notes, merged PRs).`;

function describe(c: PClaim, look: GradeLookup, date: string): string {
  const srcs = supportingSources(c, look)
    .map((s) => sourceLabel(s.source, s.chunk))
    .join(", ");
  const quotes = c.evidence
    .filter((e) => e.quoteValid)
    .slice(0, 3)
    .map((e) => `"${e.quote}"`)
    .join(" ");
  return `[${c.type}, ${date || "undated"}, sources: ${srcs || "none"}] ${c.title}. ${c.statement} Quotes: ${quotes}`;
}

export async function labelPairs(pairs: ConflictPair[], look: GradeLookup, ctx: LlmRunCtx, perCall = 20): Promise<PairLabel[]> {
  const labels: PairLabel[] = [];
  const calls: Promise<void>[] = [];
  for (let off = 0; off < pairs.length; off += perCall) {
    const slice = pairs.slice(off, off + perCall);
    const prompt =
      slice
        .map((p, i) => {
          const n = off + i;
          return `Pair ${n} (topic ${p.topicKey})\nA: ${describe(p.a, look, claimDate(p.a, look))}\nB: ${describe(p.b, look, claimDate(p.b, look))}`;
        })
        .join("\n\n") + "\n\nLabel every pair by its number.";
    calls.push(
      llmJson(
        { name: `conflicts:${off / perCall + 1}`, system: PAIR_SYSTEM, prompt, schema: PairLabelsSchema, temperature: 0.1 },
        ctx,
      )
        .then((out) => {
          for (const l of out.labels) if (l.pair >= off && l.pair < off + slice.length) labels.push(l);
        })
        .catch((e) => {
          if (!(e instanceof LlmInvalidOutputError)) throw e;
        }),
    );
  }
  await Promise.all(calls);
  return labels.sort((x, y) => x.pair - y.pair);
}
