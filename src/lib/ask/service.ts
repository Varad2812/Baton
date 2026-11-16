// "Ask the handover" server functions: answer a question, hand an unanswerable one to the departing
// owner as a follow-up, and the Q&A safety numbers for the Trust page. Every answer writes an audit
// row with counts only (never the question text).
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { assertCan, writeAudit, type Actor } from "@/lib/authz";
import { defaultEngines, type ChatEngine } from "@/lib/assistant/engines";
import { prisma } from "@/lib/db";
import { createFollowUp } from "@/lib/handover/service";
import { normaliseForMatch } from "@/lib/pipeline/quotes";
import { composeAnswer } from "./compose";
import { loadAskCorpus } from "./corpus";
import type { AskAnswer } from "./types";

export const AskInput = z.object({
  question: z
    .string({ error: "Type a question." })
    .trim()
    .min(3, "Type a question (at least 3 characters).")
    .max(500, "Keep the question under 500 characters."),
});

export const AskOwnerInput = AskInput;

/** Section used for follow-ups raised from Q&A (lands in "Purpose & status" when answered). */
export const ASK_SECTION = "General";

export async function askHandover(
  actor: Actor,
  projectId: string,
  raw: unknown,
  opts: { engines?: ChatEngine[]; offlineOnly?: boolean } = {},
): Promise<AskAnswer> {
  const { question } = AskInput.parse(raw);
  const corpus = await loadAskCorpus(actor, projectId);
  const answer = await composeAnswer({ question, corpus, role: actor.role, engines: opts.engines ?? defaultEngines(), offlineOnly: opts.offlineOnly });
  await writeAudit(prisma, {
    projectId,
    actor,
    action: "ask.answer",
    targetType: "Project",
    targetId: projectId,
    meta: {
      status: answer.status,
      reason: answer.reason ?? null,
      mode: answer.mode,
      version: answer.version,
      engine: answer.engine,
      sources: answer.sources.length,
      canaryChecked: corpus.forbidden.length,
      leakHits: 0,
      ...answer.stats,
    } as Prisma.InputJsonValue,
  });
  return answer;
}

/**
 * "Ask <owner>": the question becomes a follow-up for the departing owner (successor only). Asking the
 * same open question twice returns the existing follow-up instead of a duplicate.
 */
export async function askOwner(actor: Actor, projectId: string, raw: unknown) {
  assertCan(actor, "ask_followups");
  const { question } = AskOwnerInput.parse(raw);
  const key = normaliseForMatch(question);
  const open = await prisma.followUp.findMany({
    where: { handover: { projectId }, answer: null, askedBy: { name: actor.name } },
    select: { id: true, question: true },
  });
  const same = open.find((f) => normaliseForMatch(f.question) === key);
  if (same) return { followUpId: same.id, already: true };
  const text = /[?.!]$/.test(question) ? question : `${question}?`;
  const { followUp } = await createFollowUp(actor, projectId, { section: ASK_SECTION, question: text.length >= 5 ? text : `${text} (asked in Q&A)` });
  return { followUpId: followUp.id, already: false };
}

export type QaSafety = {
  asked: number;
  answered: number;
  refused: number;
  refusedGap: number;
  refusedLeak: number;
  /** Citations the engines proposed, and how many survived the validator. */
  proposedCitations: number;
  citations: number;
  validCitations: number;
  /** Citations in delivered answers that point to an allowed source with matching quotes (target 100%). */
  citationValidity: number;
  /** Sentences the validator removed before anyone saw them. */
  sentencesDropped: number;
  /** Answers delivered with a forbidden string in them (must be 0). */
  leaks: number;
  byEngine: Record<string, number>;
};

export async function qaSafety(projectId: string): Promise<QaSafety> {
  const rows = await prisma.auditLog.findMany({ where: { projectId, action: "ask.answer" }, select: { meta: true } });
  const out: QaSafety = { proposedCitations: 0, asked: 0, answered: 0, refused: 0, refusedGap: 0, refusedLeak: 0, citations: 0, validCitations: 0, citationValidity: 1, sentencesDropped: 0, leaks: 0, byEngine: {} };
  for (const r of rows) {
    const m = (r.meta ?? {}) as { status?: string; reason?: string; engine?: string; citations?: number; validCitations?: number; dropped?: number; leakHits?: number };
    out.asked++;
    if (m.status === "answered") {
      out.answered++;
      out.citations += m.validCitations ?? 0;
      out.validCitations += m.validCitations ?? 0;
    } else {
      out.refused++;
      if (m.reason === "gap") out.refusedGap++;
      if (m.reason === "leak") out.refusedLeak++;
    }
    out.proposedCitations += m.citations ?? 0;
    out.sentencesDropped += m.dropped ?? 0;
    out.leaks += m.leakHits ?? 0;
    if (m.engine) out.byEngine[m.engine] = (out.byEngine[m.engine] ?? 0) + 1;
  }
  out.citationValidity = out.citations ? out.validCitations / out.citations : 1;
  return out;
}
