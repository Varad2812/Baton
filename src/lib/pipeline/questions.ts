// Questions stage: at most 10 exit-interview questions, ranked by
//   priority = risk weight (by kind / checklist item) x number of dependent claims.
// Pure: candidates, dependents, ranking, template wording. LLM: phraseQuestions() (wording only).

import { z } from "zod";
import type { GapKind } from "@/generated/prisma/enums";
import { llmJson, LlmInvalidOutputError, type LlmRunCtx } from "@/lib/llm";
import { checklistItem } from "./checklist";
import { supportingSources, type GradeLookup } from "./grade";
import type { IdGen } from "./ids";
import { joinLabels, sourceLabel } from "./labels";
import type { PClaim, PConflict, PGapQuestion } from "./types";

export const MAX_QUESTIONS = 10;
export const MAX_DEPENDENTS = 9;

export const KIND_WEIGHT: Record<Exclude<GapKind, "MISSING">, number> = {
  CONFLICT: 6,
  SINGLE_OWNER: 4,
  RECURRING: 3,
  INFERRED: 2,
};

/** MISSING questions are weighted by their checklist item (credentials 8 ... code/docs 2). */
export function riskWeight(kind: GapKind, checklistKey?: string | null): number {
  if (kind === "MISSING") return checklistItem(checklistKey)?.weight ?? 5;
  return KIND_WEIGHT[kind];
}

/**
 * Claims that depend on the answer: other live claims sharing a topic, an evidence chunk,
 * or a checklist item. At least 1 (the claim itself), at most MAX_DEPENDENTS.
 */
export function dependents(target: PClaim[], all: PClaim[]): number {
  const ids = new Set(target.map((t) => t.id));
  const topics = new Set(target.map((t) => t.topicKey));
  const chunks = new Set(target.flatMap((t) => t.evidence.map((e) => e.chunkId)));
  const keys = new Set(target.flatMap((t) => t.checklistKeys));
  let n = 0;
  for (const c of all) {
    if (ids.has(c.id) || c.status === "REJECTED") continue;
    if (
      topics.has(c.topicKey) ||
      c.evidence.some((e) => chunks.has(e.chunkId)) ||
      c.checklistKeys.some((k) => keys.has(k))
    ) {
      n++;
    }
  }
  return Math.max(1, Math.min(MAX_DEPENDENTS, n));
}

export type QuestionCandidate = {
  kind: GapKind;
  relatedClaimId: string;
  checklistKey: string | null;
  weight: number;
  dependents: number;
  priority: number;
  question: string;
  rationale: string;
};

const KIND_ORDER: GapKind[] = ["CONFLICT", "MISSING", "SINGLE_OWNER", "RECURRING", "INFERRED"];

function labelsOf(c: PClaim, look: GradeLookup): string {
  return joinLabels(supportingSources(c, look).map((s) => sourceLabel(s.source, s.chunk)), 2);
}

export function buildCandidates(
  claims: PClaim[],
  conflicts: PConflict[],
  look: GradeLookup,
  singleOwnerIds: Set<string>,
): QuestionCandidate[] {
  const live = claims.filter((c) => c.status !== "REJECTED");
  const byId = new Map(live.map((c) => [c.id, c]));
  const out: QuestionCandidate[] = [];
  const push = (kind: GapKind, claim: PClaim, related: PClaim[], question: string, rationale: (d: number) => string) => {
    const checklistKey = claim.checklistKeys[0] ?? null;
    const weight = riskWeight(kind, checklistKey);
    const d = dependents(related, live);
    out.push({ kind, relatedClaimId: claim.id, checklistKey, weight, dependents: d, priority: weight * d, question, rationale: rationale(d) });
  };

  for (const cf of conflicts) {
    if (cf.kind !== "CONTRADICTS" || cf.status !== "OPEN") continue;
    const a = byId.get(cf.claimAId);
    const b = byId.get(cf.claimBId);
    if (!a || !b) continue;
    push(
      "CONFLICT",
      a,
      [a, b],
      `Which is current: "${a.title}" (${labelsOf(a, look) || "older record"}) or "${b.title}" (${labelsOf(b, look) || "newer record"})?`,
      (d) => `${labelsOf(b, look) || "A newer record"} disagrees with ${labelsOf(a, look) || "an older record"} and nothing records which one won. ${d} dependent claims.`,
    );
  }

  for (const c of live) {
    if (c.grade === "MISSING") {
      const item = checklistItem(c.checklistKeys[0]);
      const ask = c.title.replace(/^No record:\s*/i, "");
      push(
        "MISSING",
        c,
        [c],
        /^no record/i.test(c.title)
          ? `The records never cover ${ask}. What should the successor know, and where is it written down?`
          : `${ask}? Nothing in the records says.`,
        (d) => `Checklist: ${item?.label ?? "handover item"}. ${c.statement} ${d} dependent claims.`,
      );
    } else if (singleOwnerIds.has(c.id)) {
      push(
        "SINGLE_OWNER",
        c,
        [c],
        `${c.title}. Who else can build and change it?`,
        (d) => `Inferred single owner from commit history. ${d} dependent claims.`,
      );
    } else if (c.type === "RECURRING" && !c.fromTestimony) {
      push(
        "RECURRING",
        c,
        [c],
        `"${c.title}" keeps coming back. What is the real fix or workaround, and is it written down?`,
        (d) => `Reported in ${supportingSources(c, look).length} sources (${labelsOf(c, look)}) with no recorded fix. ${d} dependent claims.`,
      );
    } else if (c.grade === "INFERRED" && ["RISK", "CONTACT", "DEPENDENCY"].includes(c.type)) {
      push(
        "INFERRED",
        c,
        [c],
        `Can you confirm: ${c.statement}`,
        (d) => `${c.gradeReason || "Inferred, not stated in any record"}. ${d} dependent claims.`,
      );
    }
  }
  return out;
}

/** Highest priority first; ties by kind order; one question per related claim; at most `max`. */
export function rankQuestions(cands: QuestionCandidate[], max = MAX_QUESTIONS): QuestionCandidate[] {
  const seen = new Set<string>();
  return [...cands]
    .sort((a, b) => b.priority - a.priority || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
    .filter((c) => (seen.has(c.relatedClaimId) ? false : (seen.add(c.relatedClaimId), true)))
    .slice(0, max);
}

export function toGapQuestions(ranked: QuestionCandidate[], ids: IdGen): PGapQuestion[] {
  return ranked.map((c) => ({
    id: ids("gq"),
    kind: c.kind,
    question: c.question,
    rationale: c.rationale,
    priority: c.priority,
    relatedClaimId: c.relatedClaimId,
    checklistKey: c.checklistKey,
    answer: null,
    answeredAt: null,
    testimonySourceId: null,
  }));
}

/* ------------------------------------------------------------------------- */
/* LLM: wording only                                                          */
/* ------------------------------------------------------------------------- */

export const PhraseSchema = z.object({
  questions: z.array(z.object({ i: z.number().int(), question: z.string(), rationale: z.string() })),
});

const PHRASE_SYSTEM = `You write exit-interview questions for a departing project lead. Each draft below
was generated from a gap in the records. Rewrite each as one direct, specific question addressed to the
departing person ("you"), max 220 characters, plus a one-sentence rationale explaining why it matters
(keep the dependent-claim count). Use only facts present in the draft; do not invent names, dates or numbers.`;

export async function phraseQuestions(qs: PGapQuestion[], claims: PClaim[], ctx: LlmRunCtx): Promise<PGapQuestion[]> {
  if (!qs.length) return qs;
  const byId = new Map(claims.map((c) => [c.id, c]));
  const prompt =
    qs
      .map((q, i) => {
        const c = q.relatedClaimId ? byId.get(q.relatedClaimId) : undefined;
        return `${i}. [${q.kind}] draft: ${q.question}\n   rationale: ${q.rationale}\n   claim: ${c ? `${c.title}. ${c.statement}` : "-"}`;
      })
      .join("\n") + "\n\nReturn one item per index.";
  try {
    const out = await llmJson({ name: "questions:phrase", system: PHRASE_SYSTEM, prompt, schema: PhraseSchema, temperature: 0.3 }, ctx);
    const by = new Map(out.questions.map((q) => [q.i, q]));
    return qs.map((q, i) => {
      const p = by.get(i);
      const question = p?.question.trim();
      const rationale = p?.rationale.trim();
      return {
        ...q,
        question: question && question.length >= 12 && question.length <= 400 ? question : q.question,
        rationale: rationale && rationale.length >= 12 ? rationale : q.rationale,
      };
    });
  } catch (e) {
    if (e instanceof LlmInvalidOutputError) return qs;
    throw e;
  }
}
