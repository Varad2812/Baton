// Server functions for review and handover. Each takes the actor explicitly (route handlers pass
// getActor()), validates input with zod, enforces authz BEFORE any LLM call, and writes AuditLog.

import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";
import { allowedAccess, assertCan, canSeeClaim, ForbiddenError, writeAudit, type Actor } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { BadRequestError, ConflictError, NotFoundError } from "@/lib/http";
import { createLlmCtx } from "@/lib/llm";
import { randomId } from "@/lib/pipeline/ids";
import { findQuote } from "@/lib/pipeline/quotes";
import { regradeClaims, TX } from "@/lib/pipeline/store";
import {
  compileView,
  forbiddenStrings,
  modelWriter,
  scanForLeaks,
  templateWriter,
  type ChunkForScan,
  type CompiledView,
  type Snapshot,
  type Writer,
} from "./compile";

const ROLES: Role[] = ["OWNER", "REVIEWER", "INCOMING", "OBSERVER"];

async function projectHandover(projectId: string) {
  const h = await prisma.handover.findFirst({
    where: { projectId },
    include: { from: true, to: true, reviewer: true },
    orderBy: { id: "asc" },
  });
  if (!h) throw new NotFoundError("Handover");
  return h;
}

async function personFor(projectId: string, actor: Actor) {
  const p = await prisma.person.findFirst({ where: { projectId, name: actor.name } });
  if (!p) throw new BadRequestError(`${actor.name} is not a member of this project.`);
  return p;
}

/* ------------------------------------------------------------------------- */
/* Claims                                                                     */
/* ------------------------------------------------------------------------- */

export const EditClaimInput = z
  .object({
    title: z.string().trim().min(3).max(160).optional(),
    statement: z.string().trim().min(3).max(2000).optional(),
    section: z.string().trim().min(2).max(60).optional(),
    reviewerNote: z.string().trim().max(1000).nullable().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Nothing to change" });

export async function editClaim(actor: Actor, projectId: string, claimId: string, raw: unknown) {
  assertCan(actor, "edit_claims");
  const input = EditClaimInput.parse(raw);
  const before = await prisma.claim.findFirst({ where: { id: claimId, projectId } });
  if (!before) throw new NotFoundError("Claim");
  return prisma.$transaction(async (tx) => {
    const claim = await tx.claim.update({
      where: { id: claimId },
      data: { ...input, status: before.status === "REJECTED" ? "REJECTED" : "EDITED" },
    });
    await writeAudit(tx, {
      projectId,
      actor,
      action: "claim.edit",
      targetType: "Claim",
      targetId: claimId,
      meta: { before: { title: before.title, statement: before.statement, section: before.section, reviewerNote: before.reviewerNote }, after: input },
    });
    return { claim };
  });
}

export const RejectClaimInput = z.object({
  note: z.string().trim().max(1000).optional(),
  undo: z.boolean().optional(),
});

export async function rejectClaim(actor: Actor, projectId: string, claimId: string, raw: unknown) {
  assertCan(actor, "reject_claims");
  const input = RejectClaimInput.parse(raw);
  const before = await prisma.claim.findFirst({ where: { id: claimId, projectId } });
  if (!before) throw new NotFoundError("Claim");
  return prisma.$transaction(async (tx) => {
    const claim = await tx.claim.update({
      where: { id: claimId },
      data: input.undo
        ? { status: "DRAFT", reviewerNote: input.note ?? before.reviewerNote }
        : { status: "REJECTED", reviewerNote: input.note ?? before.reviewerNote },
    });
    await writeAudit(tx, { projectId, actor, action: input.undo ? "claim.restore" : "claim.reject", targetType: "Claim", targetId: claimId, meta: { note: input.note ?? null, before: before.status } });
    return { claim };
  });
}

/* ------------------------------------------------------------------------- */
/* Conflicts                                                                  */
/* ------------------------------------------------------------------------- */

export const ResolveConflictInput = z.object({
  resolution: z.enum(["A", "B", "BOTH", "ASKED"]),
  note: z.string().trim().max(1000).optional(),
});

/**
 * A / B: the other claim is rejected (with a note). BOTH: both stand. ASKED: stays OPEN and a
 * CONFLICT question is queued for the departing owner if none exists yet.
 */
export async function resolveConflict(actor: Actor, projectId: string, conflictId: string, raw: unknown) {
  assertCan(actor, "resolve_conflicts");
  const input = ResolveConflictInput.parse(raw);
  const cf = await prisma.conflict.findFirst({ where: { id: conflictId, projectId }, include: { claimA: true, claimB: true } });
  if (!cf) throw new NotFoundError("Conflict");
  if (cf.kind !== "CONTRADICTS") throw new ConflictError("Supersessions are evolution, not conflicts; nothing to resolve.");

  return prisma.$transaction(async (tx) => {
    const settled = input.resolution !== "ASKED";
    const conflict = await tx.conflict.update({
      where: { id: conflictId },
      data: { status: settled ? "RESOLVED" : "OPEN", resolution: input.resolution, note: input.note ?? cf.note },
    });
    if (input.resolution === "A" || input.resolution === "B") {
      const [winner, loser] = input.resolution === "A" ? [cf.claimA, cf.claimB] : [cf.claimB, cf.claimA];
      await tx.claim.update({
        where: { id: loser.id },
        data: { status: "REJECTED", reviewerNote: `Conflict resolved in favour of "${winner.title}"${input.note ? `: ${input.note}` : ""}` },
      });
    }
    let questionId: string | null = null;
    if (input.resolution === "ASKED") {
      const existing = await tx.gapQuestion.findFirst({
        where: { projectId, kind: "CONFLICT", relatedClaimId: { in: [cf.claimAId, cf.claimBId] } },
      });
      if (existing) questionId = existing.id;
      else {
        const q = await tx.gapQuestion.create({
          data: {
            id: randomId("gq"),
            projectId,
            kind: "CONFLICT",
            question: `Which is current: "${cf.claimA.title}" or "${cf.claimB.title}"?`,
            rationale: `${actor.name} could not settle this from the records and asked the departing owner.${input.note ? ` ${input.note}` : ""}`,
            priority: 60,
            relatedClaimId: cf.claimAId,
            checklistKey: "key_decisions",
          },
        });
        questionId = q.id;
      }
    }
    const changed = await regradeClaims(tx, projectId, [cf.claimAId, cf.claimBId]);
    await writeAudit(tx, {
      projectId,
      actor,
      action: "conflict.resolve",
      targetType: "Conflict",
      targetId: conflictId,
      meta: { resolution: input.resolution, note: input.note ?? null, regraded: changed, questionId },
    });
    return { conflict, questionId };
  }, TX);
}

/* ------------------------------------------------------------------------- */
/* Snapshot + compile                                                         */
/* ------------------------------------------------------------------------- */

export async function buildSnapshot(projectId: string): Promise<Snapshot> {
  const [project, h, claims, conflicts, answered] = await Promise.all([
    prisma.project.findUniqueOrThrow({ where: { id: projectId } }),
    projectHandover(projectId),
    prisma.claim.findMany({
      where: { projectId, status: { not: "REJECTED" } },
      include: { owner: true, evidence: { include: { chunk: { include: { source: true } } } } },
      orderBy: [{ section: "asc" }, { date: "asc" }, { id: "asc" }],
    }),
    prisma.conflict.findMany({ where: { projectId } }),
    prisma.gapQuestion.findMany({ where: { projectId, answer: { not: null } } }),
  ]);
  return {
    schema: 1,
    projectId,
    projectName: project.name,
    createdAt: new Date().toISOString(),
    handover: { from: h.from.name, to: h.to.name, reviewer: h.reviewer.name },
    claims: claims.map((c) => ({
      id: c.id,
      type: c.type,
      section: c.section,
      title: c.title,
      statement: c.statement,
      topicKey: c.topicKey,
      grade: c.grade,
      gradeReason: c.gradeReason,
      status: c.status,
      access: c.access,
      fromTestimony: c.fromTestimony,
      owner: c.owner?.name ?? null,
      date: c.date ? c.date.toISOString().slice(0, 10) : null,
      reviewerNote: c.reviewerNote,
      evidence: c.evidence.map((e) => ({
        chunkId: e.chunkId,
        sourceId: e.chunk.sourceId,
        sourceTitle: e.chunk.source.title,
        sourceKind: e.chunk.source.kind,
        access: e.chunk.access,
        locator: e.chunk.locator,
        quote: e.quote,
        relation: e.relation,
      })),
    })),
    conflicts: conflicts.map((c) => ({
      id: c.id,
      topicKey: c.topicKey,
      claimAId: c.claimAId,
      claimBId: c.claimBId,
      kind: c.kind,
      status: c.status,
      resolution: c.resolution,
      note: c.note,
    })),
    answeredQuestions: answered.map((q) => ({ id: q.id, question: q.question, answer: q.answer!, relatedClaimId: q.relatedClaimId })),
  };
}

async function projectChunks(projectId: string): Promise<ChunkForScan[]> {
  return prisma.chunk.findMany({
    where: { source: { projectId } },
    select: { id: true, sourceId: true, access: true, text: true },
  });
}

/** compileRoleView(versionId, role): compile one role's view of an approved version (not persisted). */
export async function compileRoleView(versionId: string, role: Role, opts: { writer?: Writer } = {}) {
  const v = await prisma.handoverVersion.findUnique({ where: { id: versionId }, include: { handover: true } });
  if (!v) throw new NotFoundError("Version");
  const snapshot = v.snapshot as unknown as Snapshot;
  const projectId = v.handover.projectId;
  const [allowed, chunks] = await Promise.all([allowedAccess(role, projectId), projectChunks(projectId)]);
  return compileView({ snapshot, role, allowed, chunks, writer: opts.writer ?? modelWriter(createLlmCtx({ budget: 2 })) });
}

/* ------------------------------------------------------------------------- */
/* Approve                                                                    */
/* ------------------------------------------------------------------------- */

export const ApproveInput = z.object({ note: z.string().trim().max(1000).optional() });

export async function approveVersion(actor: Actor, projectId: string, raw: unknown, opts: { writer?: Writer } = {}) {
  assertCan(actor, "approve_version");
  const input = ApproveInput.parse(raw);
  const h = await projectHandover(projectId);
  if (h.from.name === actor.name) throw new ForbiddenError(actor.role, "approve_version"); // no self-approval
  const approver = await personFor(projectId, actor);

  const snapshot = await buildSnapshot(projectId);
  if (!snapshot.claims.length) throw new ConflictError("Nothing to approve yet: run the pipeline first.");
  const chunks = await projectChunks(projectId);
  const writer = opts.writer ?? modelWriter(createLlmCtx({ budget: ROLES.length }));
  const views = await Promise.all(
    ROLES.map(async (role) => {
      const allowed = await allowedAccess(role, projectId);
      const r = await compileView({ snapshot, role, allowed, chunks, writer });
      return { role, ...r };
    }),
  );

  const result = await prisma.$transaction(async (tx) => {
    const fresh = await tx.handover.findUniqueOrThrow({ where: { id: h.id } });
    const number = fresh.currentVersion + 1;
    const version = await tx.handoverVersion.create({
      data: {
        handoverId: h.id,
        number,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        approvedById: approver.id,
        approvedAt: new Date(),
        note: input.note ?? null,
      },
    });
    await tx.roleView.createMany({
      data: views.map((v) => ({
        versionId: version.id,
        role: v.role,
        compiled: v.compiled as unknown as Prisma.InputJsonValue,
        hiddenCount: v.hiddenCount,
        sourceChunkIds: v.sourceChunkIds,
      })),
    });
    await tx.claim.updateMany({ where: { projectId, status: { in: ["DRAFT", "EDITED"] } }, data: { status: "APPROVED" } });
    await tx.handover.update({ where: { id: h.id }, data: { status: "APPROVED", currentVersion: number } });
    await writeAudit(tx, {
      projectId,
      actor,
      action: "version.approve",
      targetType: "HandoverVersion",
      targetId: version.id,
      meta: {
        number,
        claims: snapshot.claims.length,
        openConflicts: snapshot.conflicts.filter((c) => c.kind === "CONTRADICTS" && c.status === "OPEN").length,
        views: views.map((v) => ({ role: v.role, hidden: v.hiddenCount, writer: v.compiled.writer, canaryHits: v.compiled.canary.hits })),
      },
    });
    return { version: { id: version.id, number, approvedAt: version.approvedAt } };
  }, TX);

  return {
    ...result,
    views: views.map((v) => ({ role: v.role, hiddenCount: v.hiddenCount, writer: v.compiled.writer, canaryHits: v.compiled.canary.hits })),
  };
}

/* ------------------------------------------------------------------------- */
/* Reading views                                                              */
/* ------------------------------------------------------------------------- */

/** The stored view for the actor's own role (latest version unless a number is given). */
export async function getRoleView(actor: Actor, projectId: string, versionNumber?: number) {
  const h = await projectHandover(projectId);
  const number = versionNumber ?? h.currentVersion;
  if (!number) return { version: null, view: null, acknowledgements: [] };
  const version = await prisma.handoverVersion.findUnique({
    where: { handoverId_number: { handoverId: h.id, number } },
    include: { approvedBy: true, roleViews: { where: { role: actor.role } }, acknowledgements: { include: { person: true } } },
  });
  if (!version) throw new NotFoundError(`Version ${number}`);
  const rv = version.roleViews[0];
  return {
    version: { id: version.id, number: version.number, approvedAt: version.approvedAt, approvedBy: version.approvedBy?.name ?? null, note: version.note },
    view: rv ? { role: rv.role, compiled: rv.compiled as unknown as CompiledView, hiddenCount: rv.hiddenCount } : null,
    acknowledgements: version.acknowledgements.map((a) => ({ section: a.section, person: a.person.name, at: a.at })),
  };
}

/** Live preview of the current draft for the actor's role (template writer, no LLM, not stored). */
export async function previewRoleView(actor: Actor, projectId: string) {
  const [snapshot, allowed, chunks] = await Promise.all([buildSnapshot(projectId), allowedAccess(actor.role, projectId), projectChunks(projectId)]);
  const r = await compileView({ snapshot, role: actor.role, allowed, chunks, writer: templateWriter });
  return { view: { role: actor.role, compiled: r.compiled, hiddenCount: r.hiddenCount } };
}

/* ------------------------------------------------------------------------- */
/* Successor actions                                                          */
/* ------------------------------------------------------------------------- */

export const AckInput = z.object({ version: z.number().int().min(1), section: z.string().trim().min(2).max(60) });

export async function acknowledgeSection(actor: Actor, projectId: string, raw: unknown) {
  assertCan(actor, "acknowledge");
  const input = AckInput.parse(raw);
  const h = await projectHandover(projectId);
  const version = await prisma.handoverVersion.findUnique({
    where: { handoverId_number: { handoverId: h.id, number: input.version } },
    include: { roleViews: { where: { role: actor.role } } },
  });
  if (!version) throw new NotFoundError(`Version ${input.version}`);
  const compiled = version.roleViews[0]?.compiled as unknown as CompiledView | undefined;
  const sections = new Set(["Overview", "7-day plan", "30-day plan", ...(compiled?.sections.map((s) => s.section) ?? [])]);
  if (!sections.has(input.section)) throw new BadRequestError(`"${input.section}" is not a section of version ${input.version}.`);
  const person = await personFor(projectId, actor);
  const existing = await prisma.acknowledgement.findFirst({ where: { versionId: version.id, section: input.section, personId: person.id } });
  if (existing) return { acknowledgement: existing, already: true };
  return prisma.$transaction(async (tx) => {
    const ack = await tx.acknowledgement.create({ data: { versionId: version.id, section: input.section, personId: person.id } });
    await writeAudit(tx, { projectId, actor, action: "section.acknowledge", targetType: "HandoverVersion", targetId: version.id, meta: { section: input.section, version: input.version } });
    return { acknowledgement: ack, already: false };
  });
}

export const FollowUpInput = z
  .object({
    claimId: z.string().min(1).optional(),
    section: z.string().trim().min(2).max(60).optional(),
    question: z.string().trim().min(5).max(1000),
  })
  .refine((v) => v.claimId || v.section, { message: "Ask about a claim or a section" });

export async function createFollowUp(actor: Actor, projectId: string, raw: unknown) {
  assertCan(actor, "ask_followups");
  const input = FollowUpInput.parse(raw);
  if (input.claimId) {
    const claim = await prisma.claim.findFirst({
      where: { id: input.claimId, projectId },
      include: { evidence: { include: { chunk: { select: { access: true, sourceId: true } } } } },
    });
    // Not found and not visible look the same: never confirm a hidden claim exists.
    if (!claim || !canSeeClaim(await allowedAccess(actor.role, projectId), claim)) throw new NotFoundError("Claim");
  }
  const h = await projectHandover(projectId);
  const person = await personFor(projectId, actor);
  return prisma.$transaction(async (tx) => {
    const followUp = await tx.followUp.create({
      data: { handoverId: h.id, claimId: input.claimId ?? null, section: input.section ?? null, question: input.question, askedById: person.id },
    });
    await writeAudit(tx, { projectId, actor, action: "followup.create", targetType: "FollowUp", targetId: followUp.id, meta: { claimId: input.claimId ?? null, section: input.section ?? null } });
    return { followUp };
  });
}

export const AnswerFollowUpInput = z.object({ answer: z.string().trim().min(2).max(4000) });

export async function answerFollowUp(actor: Actor, projectId: string, followUpId: string, raw: unknown) {
  assertCan(actor, "answer_followups");
  const input = AnswerFollowUpInput.parse(raw);
  const f = await prisma.followUp.findFirst({ where: { id: followUpId, handover: { projectId } } });
  if (!f) throw new NotFoundError("Follow-up");
  return prisma.$transaction(async (tx) => {
    const followUp = await tx.followUp.update({ where: { id: followUpId }, data: { answer: input.answer, answeredAt: new Date() } });
    await writeAudit(tx, { projectId, actor, action: "followup.answer", targetType: "FollowUp", targetId: followUpId, meta: { wasAnswered: !!f.answer } });
    return { followUp };
  });
}

export const RequestAccessInput = z.object({
  section: z.string().trim().min(2).max(60).optional(),
  reason: z.string().trim().min(3).max(500),
});

/** INCOMING asks for hidden content. Recorded in the audit log for the owner; reveals nothing. */
export async function requestAccess(actor: Actor, projectId: string, raw: unknown) {
  assertCan(actor, "ask_followups");
  const input = RequestAccessInput.parse(raw);
  const row = await writeAudit(prisma, {
    projectId,
    actor,
    action: "access.requested",
    targetType: "Project",
    targetId: projectId,
    meta: { section: input.section ?? null, reason: input.reason },
  });
  return { requestId: row.id, at: row.at };
}

/* ------------------------------------------------------------------------- */
/* Trust                                                                      */
/* ------------------------------------------------------------------------- */

/**
 * Compile every role from the current draft (template writer) and scan the stored views of the
 * latest version too. hits must be 0 for every role.
 */
export async function runLeakageTest(actor: Actor, projectId: string) {
  const [snapshot, chunks, h] = await Promise.all([buildSnapshot(projectId), projectChunks(projectId), projectHandover(projectId)]);
  const stored = h.currentVersion
    ? await prisma.roleView.findMany({ where: { version: { handoverId: h.id, number: h.currentVersion } } })
    : [];
  const results = [];
  for (const role of ROLES) {
    const allowed = await allowedAccess(role, projectId);
    const draft = await compileView({ snapshot, role, allowed, chunks, writer: templateWriter });
    const hiddenClaims = snapshot.claims.filter((c) => !draft.writerInput.claims.some((v) => v.id === c.id));
    const forbidden = forbiddenStrings(allowed, chunks, hiddenClaims);
    const rv = stored.find((s) => s.role === role);
    const promptHits = scanForLeaks(draft.writerInput, forbidden).length;
    results.push({
      role,
      visibleClaims: draft.writerInput.claims.length,
      hiddenClaims: draft.hiddenCount,
      canariesChecked: forbidden.length,
      draftHits: draft.compiled.canary.hits,
      promptHits,
      storedVersion: rv ? h.currentVersion : null,
      storedHits: rv ? scanForLeaks(rv.compiled, forbidden).length : null,
    });
  }
  const totalHits = results.reduce((n, r) => n + r.draftHits + r.promptHits + (r.storedHits ?? 0), 0);
  await writeAudit(prisma, { projectId, actor, action: "trust.leakage_test", targetType: "Project", targetId: projectId, meta: { totalHits, results } as Prisma.InputJsonValue });
  return { ok: totalHits === 0, totalHits, results, at: new Date().toISOString() };
}

/** Re-run deterministic quote matching on every evidence row; update validity and re-grade. */
export async function recheckQuotes(actor: Actor, projectId: string) {
  assertCan(actor, "edit_claims");
  const evidence = await prisma.evidence.findMany({
    where: { claim: { projectId } },
    include: { chunk: { select: { text: true } } },
  });
  let valid = 0;
  const changed: { id: string; claimId: string; quoteValid: boolean; matchStart: number | null; matchEnd: number | null }[] = [];
  for (const e of evidence) {
    const m = findQuote(e.chunk.text, e.quote);
    if (m) valid++;
    const next = { quoteValid: !!m, matchStart: m?.start ?? null, matchEnd: m?.end ?? null };
    if (next.quoteValid !== e.quoteValid || next.matchStart !== e.matchStart || next.matchEnd !== e.matchEnd) {
      changed.push({ id: e.id, claimId: e.claimId, ...next });
    }
  }
  const regraded = await prisma.$transaction(async (tx) => {
    for (const c of changed) {
      await tx.evidence.update({ where: { id: c.id }, data: { quoteValid: c.quoteValid, matchStart: c.matchStart, matchEnd: c.matchEnd } });
    }
    const r = changed.length ? await regradeClaims(tx, projectId, [...new Set(changed.map((c) => c.claimId))]) : [];
    await writeAudit(tx, {
      projectId,
      actor,
      action: "trust.recheck_quotes",
      targetType: "Project",
      targetId: projectId,
      meta: { checked: evidence.length, valid, invalid: evidence.length - valid, changed: changed.length, regraded: r.length },
    });
    return r;
  }, TX);
  return { checked: evidence.length, valid, invalid: evidence.length - valid, changed: changed.length, regraded: regraded.length };
}
