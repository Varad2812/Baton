// Loads the FestFlow demo (fixtures already chunked + the pipeline cache) into the DB.
// Shared by `prisma db seed` and POST /api/demo/reset.

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type {
  Access,
  ClaimStatus,
  ClaimType,
  ConflictKind,
  ConflictStatus,
  EvidenceRelation,
  GapKind,
  Grade,
  HandoverStatus,
  RedactionKind,
  Resolution,
  RunMode,
  RunStatus,
  SourceKind,
} from "@/generated/prisma/enums";
import cacheJson from "../../../seed/pipeline-cache.json";

export const FESTFLOW_SLUG = "festflow";

type Cache = {
  project: { id: string; slug: string; name: string; description: string; createdAt: string };
  people: { id: string; name: string; roleTitle: string; email: string | null; handles: string[] }[];
  sources: {
    id: string;
    kind: SourceKind;
    title: string;
    uri: string | null;
    access: Access;
    authoritative: boolean;
    author: string | null;
    createdAt: string;
    grantedToIncoming: boolean;
  }[];
  chunks: {
    id: string;
    sourceId: string;
    ordinal: number;
    text: string;
    locator: string;
    author: string | null;
    timestamp: string | null;
    access: Access;
  }[];
  redactions: { id: string; chunkId: string; kind: RedactionKind; placeholder: string; mentionedBy: string | null }[];
  claims: {
    id: string;
    type: ClaimType;
    section: string;
    title: string;
    statement: string;
    topicKey: string;
    ownerPersonId: string | null;
    date: string | null;
    grade: Grade;
    gradeReason: string;
    status: ClaimStatus;
    access: Access;
    fromTestimony: boolean;
    isInference?: boolean;
    reviewerNote: string | null;
  }[];
  evidence: {
    id: string;
    claimId: string;
    chunkId: string;
    quote: string;
    relation: EvidenceRelation;
    quoteValid: boolean;
    matchStart: number;
    matchEnd: number;
  }[];
  conflicts: {
    id: string;
    topicKey: string;
    claimAId: string;
    claimBId: string;
    kind: ConflictKind;
    status: ConflictStatus;
    resolution: Resolution | null;
    note: string | null;
  }[];
  gapQuestions: {
    id: string;
    kind: GapKind;
    question: string;
    rationale: string;
    priority: number;
    relatedClaimId: string | null;
    checklistKey: string | null;
    answer: string | null;
    answeredAt: string | null;
    testimonySourceId: string | null;
  }[];
  handover: {
    id: string;
    fromPersonId: string;
    toPersonId: string;
    reviewerPersonId: string;
    status: HandoverStatus;
    currentVersion: number;
  };
  auditLogs: {
    id: string;
    actorName: string;
    actorRole: string;
    action: string;
    targetType: string;
    targetId: string | null;
    meta: Prisma.InputJsonValue;
    at: string;
  }[];
  pipelineRun: {
    id: string;
    mode: RunMode;
    status: RunStatus;
    model: string;
    startedAt: string;
    finishedAt: string | null;
    error: string | null;
    stages: Prisma.InputJsonValue;
  };
};

const cache = cacheJson as unknown as Cache;
const d = (s: string | null) => (s ? new Date(s) : null);

type Db = PrismaClient | Prisma.TransactionClient;

/** Id-bearing keys in the cache rows: suffixed in a sandbox so the fixed demo ids stay unique. */
const ID_KEYS = new Set([
  "id",
  "sourceId",
  "chunkId",
  "claimId",
  "claimAId",
  "claimBId",
  "relatedClaimId",
  "testimonySourceId",
  "ownerPersonId",
  "fromPersonId",
  "toPersonId",
  "reviewerPersonId",
  "targetId",
]);

/** Append `suffix` to every id field of a row (shallow; nested meta is left alone). */
export function suffixRow<T extends object>(row: T, suffix: string): T {
  if (!suffix) return row;
  const out = { ...row } as Record<string, unknown>;
  for (const [k, v] of Object.entries(out)) if (ID_KEYS.has(k) && typeof v === "string" && v) out[k] = `${v}${suffix}`;
  return out as T;
}

/** Remove a sandbox suffix from an id ("clm_auth_supabase~ab12cd" -> "clm_auth_supabase"). */
export const baseId = (id: string) => id.split("~")[0];

export type InsertOpts = {
  slug?: string;
  /** "" for the template; "~<key>" for a sandbox. */
  suffix?: string;
  kind?: "TEMPLATE" | "SANDBOX";
  visitorId?: string | null;
  expiresAt?: Date | null;
};

/** Inserts the FestFlow project (or a sandbox copy of it). Assumes it does not exist yet. */
export async function insertFestflow(tx: Prisma.TransactionClient, opts: InsertOpts = {}) {
  const sfx = opts.suffix ?? "";
  const S = <T extends object>(rows: T[]) => rows.map((r) => suffixRow(r, sfx));
  const projectId = `${cache.project.id}${sfx}`;
  const P = <T extends object>(rows: T[]) => S(rows).map((r) => ({ ...r, projectId }));

  await tx.project.create({
    data: {
      id: projectId,
      slug: opts.slug ?? cache.project.slug,
      name: cache.project.name,
      description: cache.project.description,
      createdAt: new Date(cache.project.createdAt),
      kind: opts.kind ?? "TEMPLATE",
      visitorId: opts.visitorId ?? null,
      templateSlug: opts.kind === "SANDBOX" ? FESTFLOW_SLUG : null,
      idSuffix: sfx,
      expiresAt: opts.expiresAt ?? null,
    },
  });
  await tx.person.createMany({
    data: P(cache.people.map(({ id, name, roleTitle, email, handles }) => ({ id, name, roleTitle, email, handles }))),
  });
  await tx.source.createMany({
    data: P(cache.sources.map((s) => ({ ...s, createdAt: new Date(s.createdAt) }))),
  });
  await tx.chunk.createMany({
    data: S(cache.chunks.map((c) => ({ ...c, timestamp: d(c.timestamp) }))),
  });
  await tx.redaction.createMany({ data: S(cache.redactions) });
  await tx.claim.createMany({
    // isInference is pipeline metadata, not a column.
    data: P(cache.claims.map((c) => ({ ...c, isInference: undefined, date: d(c.date) }))),
  });
  await tx.evidence.createMany({ data: S(cache.evidence) });
  await tx.conflict.createMany({ data: P(cache.conflicts) });
  await tx.gapQuestion.createMany({
    data: P(cache.gapQuestions.map((g) => ({ ...g, answeredAt: d(g.answeredAt) }))),
  });
  await tx.handover.create({ data: { ...suffixRow(cache.handover, sfx), projectId } });
  await tx.pipelineRun.create({
    data: {
      ...suffixRow(cache.pipelineRun, sfx),
      projectId,
      startedAt: new Date(cache.pipelineRun.startedAt),
      finishedAt: d(cache.pipelineRun.finishedAt),
    },
  });
  await tx.auditLog.createMany({
    data: P(cache.auditLogs.map((a) => ({ ...a, at: new Date(a.at) }))),
  });
  return projectId;
}

const TX = { timeout: 60_000, maxWait: 15_000 } as const;

/** Seeds the FestFlow template if it is missing. Returns true if it inserted. */
export async function seedFestflow(db: PrismaClient): Promise<boolean> {
  const exists = await db.project.findUnique({ where: { slug: FESTFLOW_SLUG }, select: { id: true } });
  if (exists) return false;
  await db.$transaction((tx) => insertFestflow(tx), TX);
  return true;
}

/** Wipes the FestFlow template only (cascade) and re-seeds it, atomically. */
export async function resetFestflow(db: PrismaClient) {
  await db.$transaction(async (tx) => {
    await tx.project.deleteMany({ where: { slug: FESTFLOW_SLUG } });
    // Seeded ids are fixed, so also clear any row that survived under another project.
    await tx.project.deleteMany({ where: { id: cache.project.id } });
    await insertFestflow(tx);
  }, TX);
  return festflowCounts(db);
}

export async function festflowCounts(db: Db, projectId: string = cache.project.id) {
  const [sources, chunks, claims, byGrade, conflicts, gaps, redactions] = await Promise.all([
    db.source.count({ where: { projectId } }),
    db.chunk.count({ where: { source: { projectId } } }),
    db.claim.count({ where: { projectId } }),
    db.claim.groupBy({ by: ["grade"], where: { projectId }, _count: { _all: true } }),
    db.conflict.count({ where: { projectId, kind: "CONTRADICTS", status: "OPEN" } }),
    db.gapQuestion.count({ where: { projectId } }),
    db.redaction.count({ where: { chunk: { source: { projectId } } } }),
  ]);
  return {
    sources,
    chunks,
    redactions,
    claims,
    claimsByGrade: Object.fromEntries(byGrade.map((g) => [g.grade, g._count._all])),
    openConflicts: conflicts,
    gapQuestions: gaps,
  };
}
