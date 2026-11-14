// Validate stage (deterministic) + topic canonicalisation (LLM, optional) + merge.
// A quote survives only if it is found (after whitespace/case/smart-quote normalisation)
// inside the chunk it cites, and that chunk was part of the batch the model saw.

import { z } from "zod";
import type { Access } from "@/generated/prisma/enums";
import { llmJson, LlmInvalidOutputError, type LlmRunCtx } from "@/lib/llm";
import { isSection } from "./checklist";
import type { ExtractedClaim } from "./extract";
import { maxAccessOf } from "./grade";
import { slugKey, type IdGen } from "./ids";
import { findQuote, normaliseForMatch } from "./quotes";
import type { PChunk, PClaim, PEvidence, PPerson } from "./types";

export type RawExtracted = ExtractedClaim & { batchId: string; batchChunkIds: string[] };

export type ValidateStats = {
  rawClaims: number;
  rawQuotes: number;
  validQuotes: number;
  droppedQuotes: number;
  discardedClaims: number;
};

export function personResolver(people: PPerson[]) {
  const norm = (h: string) => h.trim().replace(/^@/, "").toLowerCase();
  const by = new Map<string, PPerson>();
  for (const p of people) {
    for (const h of [p.name, p.email ?? "", ...p.handles]) if (h) by.set(norm(h), p);
    const first = p.name.replace(/^Prof\.\s*/, "").split(/\s+/)[0];
    if (first && !by.has(norm(first))) by.set(norm(first), p);
  }
  return (h: string | null | undefined): PPerson | null => (h ? (by.get(norm(h)) ?? null) : null);
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Validate every quote; drop invalid ones; discard non-inference claims left without evidence. */
export function validateExtracted(
  raw: RawExtracted[],
  chunks: Map<string, PChunk>,
  people: PPerson[],
  ids: IdGen,
): { claims: PClaim[]; stats: ValidateStats } {
  const resolve = personResolver(people);
  const stats: ValidateStats = { rawClaims: raw.length, rawQuotes: 0, validQuotes: 0, droppedQuotes: 0, discardedClaims: 0 };
  const claims: PClaim[] = [];

  for (const r of raw) {
    const allowed = new Set(r.batchChunkIds);
    const evidence: PEvidence[] = [];
    const seen = new Set<string>();
    for (const e of r.evidence) {
      stats.rawQuotes++;
      const chunk = allowed.has(e.chunkId) ? chunks.get(e.chunkId) : undefined;
      const m = chunk ? findQuote(chunk.text, e.quote) : null;
      if (!chunk || !m) {
        stats.droppedQuotes++;
        continue;
      }
      stats.validQuotes++;
      const k = `${chunk.id}:${m.start}`;
      if (seen.has(k)) continue;
      seen.add(k);
      evidence.push({
        id: ids("ev"),
        chunkId: chunk.id,
        // Store the exact chunk substring so the quote is byte-identical to the source.
        quote: chunk.text.slice(m.start, m.end),
        relation: e.relation,
        quoteValid: true,
        matchStart: m.start,
        matchEnd: m.end,
      });
    }

    const hasSupport = evidence.some((e) => e.relation === "SUPPORTS");
    if (!hasSupport && !r.isInference) {
      stats.discardedClaims++;
      continue;
    }
    // Access for evidence-less inferences = the most sensitive chunk the model saw.
    const batchAccess: Access = maxAccessOf(
      r.batchChunkIds.map((id) => chunks.get(id)?.access).filter((a): a is Access => !!a),
    );
    const owner = resolve(r.owner);
    claims.push({
      id: ids("clm"),
      type: r.type,
      section: isSection(r.section) ? r.section : "Decisions",
      title: r.title.trim().slice(0, 160),
      statement: r.statement.trim(),
      topicKey: slugKey(r.topicKey).replace(/^gap:/, "") || "misc",
      ownerPersonId: owner?.id ?? null,
      date: ISO_DAY.test(r.date) ? r.date : null,
      grade: "SINGLE_SOURCE",
      gradeReason: "",
      status: "DRAFT",
      access: batchAccess,
      fromTestimony: false,
      isInference: r.isInference,
      reviewerNote: null,
      checklistKeys: [...new Set(r.checklistKeys)],
      evidence,
    });
  }
  return { claims, stats };
}

/* ------------------------------------------------------------------------- */
/* Topic canonicalisation + merge                                             */
/* ------------------------------------------------------------------------- */

export const CanonicalSchema = z.object({
  items: z.array(
    z.object({
      i: z.number().int(),
      topicKey: z.string(),
      sameAs: z.number().int().describe("index of an EARLIER claim stating the same fact, or -1"),
    }),
  ),
});

const CANON_SYSTEM = `You normalise a claim ledger extracted in separate batches.
Return items ONLY for claims that need a change (a different topicKey, or a duplicate); omit the rest.
For each returned claim:
- topicKey: one canonical snake_case key per SUBJECT. Claims about the same subject (even if they
  disagree, or one replaced the other) must share the key. Prefer the clearest existing key.
- sameAs: the index of an EARLIER claim of the SAME type that states the same fact in the same
  direction (a duplicate from another record), else -1. Never mark claims that disagree, or where one
  replaced the other, as sameAs.`;

export async function canonicaliseTopics(claims: PClaim[], ctx: LlmRunCtx): Promise<{ topicKey: string; sameAs: number }[]> {
  const identity = claims.map((c) => ({ topicKey: c.topicKey, sameAs: -1 }));
  if (claims.length < 2) return identity;
  const list = claims
    .map((c, i) => `${i} | ${c.type} | ${c.topicKey} | ${c.date ?? "-"} | ${c.title}`)
    .join("\n");
  try {
    const out = await llmJson(
      {
        name: "validate:canonicalise",
        system: CANON_SYSTEM,
        prompt: `Claims (index | type | topicKey | date | title):\n${list}\n\nReturn items only for the claims that change.`,
        schema: CanonicalSchema,
        temperature: 0.1,
      },
      ctx,
    );
    const result = [...identity];
    for (const it of out.items) {
      if (it.i < 0 || it.i >= claims.length) continue;
      const key = slugKey(it.topicKey).replace(/^gap:/, "");
      const same =
        it.sameAs >= 0 && it.sameAs < it.i && claims[it.sameAs]?.type === claims[it.i].type ? it.sameAs : -1;
      result[it.i] = { topicKey: key || claims[it.i].topicKey, sameAs: same };
    }
    return result;
  } catch (e) {
    // Canonicalisation is an improvement, not a requirement: bad output -> keep keys as extracted.
    if (e instanceof LlmInvalidOutputError) return identity;
    throw e;
  }
}

/**
 * Apply canonical keys and merge duplicates. Merging unions evidence (deduped by chunk+offset).
 * Deterministic safety net: same type + topicKey + normalised title also merge.
 */
export function applyCanonical(claims: PClaim[], canon: { topicKey: string; sameAs: number }[]): { claims: PClaim[]; merged: number } {
  const keyed = claims.map((c, i) => ({ ...c, topicKey: canon[i]?.topicKey ?? c.topicKey }));
  const root = keyed.map((_, i) => i);
  const find = (i: number): number => (root[i] === i ? i : (root[i] = find(root[i])));
  canon.forEach((c, i) => {
    if (c.sameAs >= 0 && c.sameAs < keyed.length) root[find(i)] = find(c.sameAs);
  });
  const titleKey = new Map<string, number>();
  keyed.forEach((c, i) => {
    const k = `${c.type}|${c.topicKey}|${normaliseForMatch(c.title)}`;
    const prev = titleKey.get(k);
    if (prev !== undefined) root[find(i)] = find(prev);
    else titleKey.set(k, i);
  });

  const out = new Map<number, PClaim>();
  let merged = 0;
  keyed.forEach((c, i) => {
    const r = find(i);
    const base = out.get(r);
    if (!base) {
      out.set(r, { ...c, evidence: [...c.evidence] });
      return;
    }
    merged++;
    const seen = new Set(base.evidence.map((e) => `${e.chunkId}:${e.matchStart}`));
    for (const e of c.evidence) {
      const k = `${e.chunkId}:${e.matchStart}`;
      if (!seen.has(k)) {
        seen.add(k);
        base.evidence.push(e);
      }
    }
    base.isInference = base.isInference && c.isInference;
    base.checklistKeys = [...new Set([...base.checklistKeys, ...c.checklistKeys])];
    base.ownerPersonId ??= c.ownerPersonId;
    base.date ??= c.date;
    base.access = maxAccessOf([base.access, c.access]);
  });
  return { claims: [...out.values()], merged };
}
