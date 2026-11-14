// Gap interview answers become TESTIMONY: a new Source + Chunk (redacted), evidence on that chunk,
// a re-graded claim, and (for conflict questions) a settled or ASKED conflict.

import { z } from "zod";
import type { Claim, Prisma } from "@/generated/prisma/client";
import { assertCan, writeAudit, type Actor } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { ConflictError, NotFoundError } from "@/lib/http";
import { createLlmCtx, llmJson, LlmInvalidOutputError, LlmUnavailableError, type LlmRunCtx } from "@/lib/llm";
import { checklistItem } from "./checklist";
import { randomId } from "./ids";
import { Redactor } from "./normalise";
import { findQuote, normaliseForMatch } from "./quotes";
import { regradeClaims, TX } from "./store";

export const AnswerInput = z.object({ answer: z.string().trim().min(10).max(4000) });

export type Settlement = "A" | "B" | "BOTH" | "UNCLEAR";

/* ------------------------------------------------------------------------- */
/* Pure helpers                                                               */
/* ------------------------------------------------------------------------- */

const STOP = new Set(
  "about above after again also because before being below between both could does doing down during each from further have having here into itself just more most only other over same should some such than that their them then there these they this those through under until very were what when where which while will with would your yours ours final going testing week today".split(
    " ",
  ),
);

export function tokens(s: string): Set<string> {
  return new Set(
    normaliseForMatch(s)
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4 && !STOP.has(w)),
  );
}

/** Deterministic fallback: which side does the answer name (and the other side not)? */
export function settleByTokens(a: string, b: string, answer: string): Settlement {
  const ta = tokens(a);
  const tb = tokens(b);
  const ans = tokens(answer);
  const onlyA = [...ta].filter((w) => !tb.has(w) && ans.has(w)).length;
  const onlyB = [...tb].filter((w) => !ta.has(w) && ans.has(w)).length;
  const negated = (side: Set<string>) =>
    [...side].some((w) => new RegExp(`\\b(not|no|drop|dropped|instead of|never)\\s+(the\\s+)?${w}`).test(normaliseForMatch(answer)));
  const aHit = onlyA > 0 && !negated(ta);
  const bHit = onlyB > 0 && !negated(tb);
  if (aHit && !bHit) return "A";
  if (bHit && !aHit) return "B";
  return "UNCLEAR";
}

/** First substantial sentence of the (redacted) answer: always a verbatim span of it. */
export function pickQuote(answer: string): string {
  const sentences = answer
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.replace(/\[REDACTED:[A-Z]+-\d+\]/g, "").trim().length >= 12);
  const s = sentences[0] ?? answer.trim();
  return s.length > 300 ? s.slice(0, 300) : s;
}

export function fallbackTitle(answer: string): string {
  const s = pickQuote(answer).replace(/[.!?]$/, "");
  if (s.length <= 90) return s;
  return `${s.slice(0, 88).replace(/\s+\S*$/, "")}…`;
}

const istDay = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

/* ------------------------------------------------------------------------- */
/* LLM: interpret the answer (title/statement + settlement)                   */
/* ------------------------------------------------------------------------- */

export const InterpretSchema = z.object({
  title: z.string().describe("<= 90 chars, the fact the answer establishes"),
  statement: z.string().describe("1-3 sentences using ONLY facts stated in the answer"),
  resolution: z.enum(["A", "B", "BOTH", "UNCLEAR", "NA"]).describe("for conflict questions: which claim the answer confirms; NA otherwise"),
});

const INTERPRET_SYSTEM = `A departing project lead answered an exit-interview question. Turn the answer into
one handover claim (title + statement) using only what the answer says. Never add facts.
If two conflicting claims A and B are given, say which one the answer confirms as current
(A, B, BOTH if both remain true, UNCLEAR if the answer does not settle it); otherwise NA.`;

async function interpret(
  question: string,
  answer: string,
  pair: { a: Claim; b: Claim } | null,
  ctx: LlmRunCtx,
): Promise<z.infer<typeof InterpretSchema> | null> {
  const conflict = pair
    ? `\nClaim A: ${pair.a.title}. ${pair.a.statement}\nClaim B: ${pair.b.title}. ${pair.b.statement}`
    : "";
  try {
    return await llmJson(
      {
        name: "testimony:interpret",
        system: INTERPRET_SYSTEM,
        prompt: `Question: ${question}${conflict}\nAnswer: ${answer}`,
        schema: InterpretSchema,
        temperature: 0.1,
      },
      ctx,
    );
  } catch (e) {
    if (e instanceof LlmUnavailableError || e instanceof LlmInvalidOutputError) return null;
    throw e;
  }
}

/* ------------------------------------------------------------------------- */
/* Server function                                                            */
/* ------------------------------------------------------------------------- */

export async function answerGapQuestion(
  actor: Actor,
  projectId: string,
  questionId: string,
  raw: unknown,
  opts: { llm?: LlmRunCtx } = {},
) {
  assertCan(actor, "answer_interview");
  const { answer } = AnswerInput.parse(raw);

  const q = await prisma.gapQuestion.findFirst({
    where: { id: questionId, projectId },
    include: { relatedClaim: true },
  });
  if (!q) throw new NotFoundError("Question");
  if (q.answer) throw new ConflictError("This question has already been answered.");

  const ordered = await prisma.gapQuestion.findMany({
    where: { projectId },
    orderBy: [{ priority: "desc" }, { id: "asc" }],
    select: { id: true },
  });
  const qn = ordered.findIndex((x) => x.id === q.id) + 1;

  // Redact before anything is stored or sent to a model.
  const existing = await prisma.redaction.groupBy({
    by: ["kind"],
    where: { chunk: { source: { projectId } } },
    _count: { _all: true },
  });
  const redactor = new Redactor(`${randomId("red")}_`, Object.fromEntries(existing.map((e) => [e.kind, e._count._all])));
  const red = redactor.redact(answer, actor.name);

  const conflict =
    q.kind === "CONFLICT" && q.relatedClaimId
      ? await prisma.conflict.findFirst({
          where: { projectId, kind: "CONTRADICTS", OR: [{ claimAId: q.relatedClaimId }, { claimBId: q.relatedClaimId }] },
          include: { claimA: true, claimB: true },
          orderBy: { status: "asc" },
        })
      : null;

  const llm = opts.llm ?? createLlmCtx({ budget: 2 });
  const meaning = await interpret(q.question, red.text, conflict ? { a: conflict.claimA, b: conflict.claimB } : null, llm);
  let settlement: Settlement | null = null;
  if (conflict) {
    const r = meaning?.resolution;
    settlement =
      r && r !== "NA"
        ? r
        : settleByTokens(`${conflict.claimA.title} ${conflict.claimA.statement}`, `${conflict.claimB.title} ${conflict.claimB.statement}`, red.text);
  }

  const now = new Date();
  const header = `Q${qn}: ${q.question}\nA (${actor.name}, ${istDay(now)}): `;
  const chunkText = header + red.text;
  const quote = pickQuote(red.text);
  const match = findQuote(chunkText, quote);
  if (!match) throw new Error("testimony quote must match its own chunk"); // unreachable by construction

  const person = await prisma.person.findFirst({ where: { projectId, name: actor.name }, select: { id: true } });
  const title = (meaning?.title.trim() || fallbackTitle(red.text)).slice(0, 160);
  const statement = meaning?.statement.trim() || red.text.slice(0, 600);

  const result = await prisma.$transaction(async (tx) => {
    const source = await tx.source.create({
      data: {
        id: randomId("src"),
        projectId,
        kind: "TESTIMONY",
        title: `Exit interview · Q${qn} answered by ${actor.name}`,
        access: "TEAM",
        authoritative: false,
        author: actor.name,
        createdAt: now,
      },
    });
    const chunk = await tx.chunk.create({
      data: {
        id: `${source.id.replace(/^src_/, "chk_")}_0`,
        sourceId: source.id,
        ordinal: 0,
        text: chunkText,
        locator: `interview Q${qn}`,
        author: actor.name,
        timestamp: now,
        access: "TEAM",
      },
    });
    if (red.redactions.length) {
      await tx.redaction.createMany({
        data: red.redactions.map((r) => ({ id: r.id, chunkId: chunk.id, kind: r.kind, placeholder: r.placeholder, mentionedBy: r.mentionedBy })),
      });
    }
    const evidence = {
      chunkId: chunk.id,
      quote: chunkText.slice(match.start, match.end),
      relation: "SUPPORTS" as const,
      quoteValid: true,
      matchStart: match.start,
      matchEnd: match.end,
    };

    let claimId: string;
    const rc = q.relatedClaim;
    if (rc && rc.grade === "MISSING") {
      // The interview fills the gap: the MISSING claim becomes a testimony claim.
      await tx.claim.update({
        where: { id: rc.id },
        data: {
          title,
          statement,
          fromTestimony: true,
          ownerPersonId: person?.id ?? rc.ownerPersonId,
          date: new Date(now.toISOString().slice(0, 10)),
        },
      });
      await tx.evidence.create({ data: { id: randomId("ev"), claimId: rc.id, ...evidence } });
      claimId = rc.id;
    } else {
      const item = checklistItem(q.checklistKey);
      const base = conflict?.claimA ?? rc;
      const created = await tx.claim.create({
        data: {
          id: randomId("clm"),
          projectId,
          type: base?.type ?? (q.kind === "RECURRING" ? "RECURRING" : "DECISION"),
          section: base?.section ?? item?.section ?? "Decisions",
          title,
          statement,
          topicKey: conflict?.topicKey ?? (rc ? `${rc.topicKey}_answer` : `testimony_${q.checklistKey ?? q.id}`),
          ownerPersonId: person?.id ?? null,
          date: new Date(now.toISOString().slice(0, 10)),
          grade: "SINGLE_SOURCE",
          gradeReason: "",
          access: "TEAM",
          fromTestimony: true,
        },
      });
      await tx.evidence.create({ data: { id: randomId("ev"), claimId: created.id, ...evidence } });
      claimId = created.id;
    }

    if (conflict) {
      const settled = settlement === "A" || settlement === "B" || settlement === "BOTH" ? settlement : null;
      const conflictUpdate: Prisma.ConflictUpdateInput = {
        status: settled ? "RESOLVED" : "OPEN",
        resolution: settled ?? "ASKED",
        note: settled
          ? `Settled in exit interview Q${qn} (${actor.name}): "${evidence.quote}"`
          : `Asked in exit interview Q${qn}; the answer did not settle it.`,
      };
      await tx.conflict.update({ where: { id: conflict.id }, data: conflictUpdate });
      if (settlement === "A" || settlement === "B") {
        const loser = settlement === "A" ? conflict.claimB : conflict.claimA;
        await tx.claim.update({
          where: { id: loser.id },
          data: { reviewerNote: `Superseded per exit interview Q${qn}. Reviewer may reject.` },
        });
      }
    }

    await tx.gapQuestion.update({
      where: { id: q.id },
      data: {
        answer: red.text,
        answeredAt: now,
        testimonySourceId: source.id,
        relatedClaimId: rc?.grade === "MISSING" ? rc.id : claimId,
      },
    });

    const touched = [claimId, ...(conflict ? [conflict.claimAId, conflict.claimBId] : [])];
    await regradeClaims(tx, projectId, touched);
    await writeAudit(tx, {
      projectId,
      actor,
      action: "interview.answer",
      targetType: "GapQuestion",
      targetId: q.id,
      meta: {
        claimId,
        sourceId: source.id,
        redactions: red.redactions.length,
        conflict: conflict ? { id: conflict.id, settlement } : null,
        interpretedBy: meaning ? "model" : "fallback",
      },
    });
    const claim = await tx.claim.findUniqueOrThrow({ where: { id: claimId }, include: { evidence: true } });
    return { claim, sourceId: source.id, chunkId: chunk.id };
  }, TX);

  return {
    questionId: q.id,
    claim: result.claim,
    sourceId: result.sourceId,
    redactions: red.redactions.length,
    conflict: conflict ? { id: conflict.id, settlement } : null,
  };
}
