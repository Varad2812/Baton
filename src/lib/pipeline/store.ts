// DB <-> pipeline data. Loaders return plain P* shapes; persistResult writes a whole result
// in ONE transaction; regradeClaims recomputes grades for touched claims after any mutation.

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { gradeAll, inferIsInference, lookupFrom } from "./grade";
import type { PriorState } from "./preserve";
import type { PChunk, PClaim, PConflict, PGapQuestion, PPerson, PSource, PipelineInput } from "./types";

type Db = PrismaClient | Prisma.TransactionClient;

export const TX = { timeout: 90_000, maxWait: 15_000 } as const;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export async function loadProjectData(projectId: string, db: Db = prisma) {
  const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  const [sources, chunks, people, redactions] = await Promise.all([
    db.source.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } }),
    db.chunk.findMany({ where: { source: { projectId } }, orderBy: [{ sourceId: "asc" }, { ordinal: "asc" }] }),
    db.person.findMany({ where: { projectId } }),
    db.redaction.count({ where: { chunk: { source: { projectId } } } }),
  ]);
  const input: PipelineInput = {
    projectId,
    projectName: project.name,
    sources: sources.map<PSource>((s) => ({
      id: s.id,
      kind: s.kind,
      title: s.title,
      uri: s.uri,
      access: s.access,
      authoritative: s.authoritative,
      author: s.author,
      createdAt: s.createdAt.toISOString(),
      grantedToIncoming: s.grantedToIncoming,
    })),
    chunks: chunks.map<PChunk>((c) => ({
      id: c.id,
      sourceId: c.sourceId,
      ordinal: c.ordinal,
      text: c.text,
      locator: c.locator,
      author: c.author,
      timestamp: iso(c.timestamp),
      access: c.access,
    })),
    people: people.map<PPerson>((p) => ({
      id: p.id,
      name: p.name,
      roleTitle: p.roleTitle,
      email: p.email,
      handles: p.handles,
    })),
  };
  return { project, input, redactions };
}

export async function loadPriorState(projectId: string, db: Db = prisma): Promise<PriorState> {
  const [claims, conflicts, gapQuestions] = await Promise.all([
    db.claim.findMany({ where: { projectId }, include: { evidence: true } }),
    db.conflict.findMany({ where: { projectId } }),
    db.gapQuestion.findMany({ where: { projectId } }),
  ]);
  return {
    claims: claims.map(toPClaim),
    conflicts: conflicts.map<PConflict>((c) => ({
      id: c.id,
      topicKey: c.topicKey,
      claimAId: c.claimAId,
      claimBId: c.claimBId,
      kind: c.kind,
      status: c.status,
      resolution: c.resolution,
      note: c.note,
    })),
    gapQuestions: gapQuestions.map<PGapQuestion>((g) => ({
      id: g.id,
      kind: g.kind,
      question: g.question,
      rationale: g.rationale,
      priority: g.priority,
      relatedClaimId: g.relatedClaimId,
      checklistKey: g.checklistKey,
      answer: g.answer,
      answeredAt: iso(g.answeredAt),
      testimonySourceId: g.testimonySourceId,
    })),
  };
}

type ClaimRow = Prisma.ClaimGetPayload<{ include: { evidence: true } }>;

export function toPClaim(c: ClaimRow): PClaim {
  return {
    id: c.id,
    type: c.type,
    section: c.section,
    title: c.title,
    statement: c.statement,
    topicKey: c.topicKey,
    ownerPersonId: c.ownerPersonId,
    date: c.date ? c.date.toISOString().slice(0, 10) : null,
    grade: c.grade,
    gradeReason: c.gradeReason,
    status: c.status,
    access: c.access,
    fromTestimony: c.fromTestimony,
    isInference: inferIsInference(c),
    reviewerNote: c.reviewerNote,
    checklistKeys: c.topicKey.startsWith("gap:") ? [c.topicKey.slice(4)] : [],
    evidence: c.evidence.map((e) => ({
      id: e.id,
      chunkId: e.chunkId,
      quote: e.quote,
      relation: e.relation,
      quoteValid: e.quoteValid,
      matchStart: e.matchStart,
      matchEnd: e.matchEnd,
    })),
  };
}

function claimRow(projectId: string, c: PClaim): Prisma.ClaimCreateManyInput {
  return {
    id: c.id,
    projectId,
    type: c.type,
    section: c.section,
    title: c.title,
    statement: c.statement,
    topicKey: c.topicKey,
    ownerPersonId: c.ownerPersonId,
    date: c.date ? new Date(`${c.date.slice(0, 10)}T00:00:00.000Z`) : null,
    grade: c.grade,
    gradeReason: c.gradeReason,
    status: c.status,
    access: c.access,
    fromTestimony: c.fromTestimony,
    reviewerNote: c.reviewerNote,
  };
}

/**
 * Replace the project's claims, evidence, conflicts and gap questions with `result`, atomically.
 * Follow-up links to claims that survive (same id) are restored.
 */
export async function persistResult(
  tx: Prisma.TransactionClient,
  projectId: string,
  result: { claims: PClaim[]; conflicts: PConflict[]; gapQuestions: PGapQuestion[] },
) {
  const [chunkRows, personRows, sourceRows] = await Promise.all([
    tx.chunk.findMany({ where: { source: { projectId } }, select: { id: true } }),
    tx.person.findMany({ where: { projectId }, select: { id: true } }),
    tx.source.findMany({ where: { projectId }, select: { id: true } }),
  ]);
  const chunkIds = new Set(chunkRows.map((c) => c.id));
  const personIds = new Set(personRows.map((p) => p.id));
  const sourceIds = new Set(sourceRows.map((s) => s.id));

  const followUps = await tx.followUp.findMany({
    where: { handover: { projectId }, claimId: { not: null } },
    select: { id: true, claimId: true },
  });

  await tx.gapQuestion.deleteMany({ where: { projectId } });
  await tx.conflict.deleteMany({ where: { projectId } });
  await tx.claim.deleteMany({ where: { projectId } });

  const claims = result.claims.map((c) => ({
    ...c,
    ownerPersonId: c.ownerPersonId && personIds.has(c.ownerPersonId) ? c.ownerPersonId : null,
  }));
  const claimIds = new Set(claims.map((c) => c.id));
  await tx.claim.createMany({ data: claims.map((c) => claimRow(projectId, c)) });
  const evidence = claims.flatMap((c) =>
    c.evidence
      .filter((e) => chunkIds.has(e.chunkId))
      .map((e) => ({
        id: e.id,
        claimId: c.id,
        chunkId: e.chunkId,
        quote: e.quote,
        relation: e.relation,
        quoteValid: e.quoteValid,
        matchStart: e.matchStart,
        matchEnd: e.matchEnd,
      })),
  );
  const evIds = new Set<string>();
  await tx.evidence.createMany({
    data: evidence.filter((e) => (evIds.has(e.id) ? false : (evIds.add(e.id), true))),
  });
  await tx.conflict.createMany({
    data: result.conflicts
      .filter((c) => claimIds.has(c.claimAId) && claimIds.has(c.claimBId))
      .map((c) => ({ ...c, projectId })),
  });
  await tx.gapQuestion.createMany({
    data: result.gapQuestions.map((g) => ({
      ...g,
      projectId,
      relatedClaimId: g.relatedClaimId && claimIds.has(g.relatedClaimId) ? g.relatedClaimId : null,
      testimonySourceId: g.testimonySourceId && sourceIds.has(g.testimonySourceId) ? g.testimonySourceId : null,
      answeredAt: g.answeredAt ? new Date(g.answeredAt) : null,
    })),
  });
  for (const f of followUps) {
    if (f.claimId && claimIds.has(f.claimId)) {
      await tx.followUp.update({ where: { id: f.id }, data: { claimId: f.claimId } });
    }
  }
  return { claims: claims.length, evidence: evidence.length, conflicts: result.conflicts.length, gapQuestions: result.gapQuestions.length };
}

/**
 * Recompute grade, gradeReason and access for the given claims (or all claims of the project)
 * from their current evidence and OPEN conflicts. Returns the ids whose grade changed.
 */
export async function regradeClaims(tx: Db, projectId: string, claimIds?: string[]): Promise<string[]> {
  const { input } = await loadProjectData(projectId, tx);
  const look = lookupFrom(input.chunks, input.sources);
  const prior = await loadPriorState(projectId, tx);
  const target = claimIds ? new Set(claimIds) : null;
  const regraded = gradeAll(prior.claims, prior.conflicts, look);
  const changed: string[] = [];
  for (const c of regraded) {
    if (target && !target.has(c.id)) continue;
    const before = prior.claims.find((p) => p.id === c.id)!;
    if (before.grade === c.grade && before.gradeReason === c.gradeReason && before.access === c.access) continue;
    await tx.claim.update({ where: { id: c.id }, data: { grade: c.grade, gradeReason: c.gradeReason, access: c.access } });
    changed.push(c.id);
  }
  return changed;
}
