// Source server functions: create project, upload files, import GitHub, label sources.
// Every input is redacted and chunked BEFORE it is stored (raw secrets never reach the DB).

import { z } from "zod";
import type { Access, RedactionKind } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { assertCan, PERSONAS, writeAudit, type Actor } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { BadRequestError, ConflictError, NotFoundError } from "@/lib/http";
import { randomId, slugKey } from "./ids";
import { fileToRawSources, MAX_FILES, type UploadFile } from "./ingest/files";
import { importGithubRepo } from "./ingest/github";
import { itemKey, normaliseSources, Redactor, type NormalisedChunk, type PersonInput, type RawSource } from "./normalise";
import { regradeClaims, TX } from "./store";
import { PROJECT_TTL_MS } from "@/lib/sandbox";
import { getVisitorId } from "@/lib/visitor";

const AccessEnum = z.enum(["PUBLIC", "TEAM", "RESTRICTED"]);

/* ------------------------------------------------------------------------- */
/* Create project                                                             */
/* ------------------------------------------------------------------------- */

export const CreateProjectInput = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).default(""),
});

/** Demo personas become the project's people, with Meera -> Arjun handover reviewed by Prof. Rao. */
export async function createProject(actor: Actor, raw: unknown) {
  assertCan(actor, "connect_sources");
  const input = CreateProjectInput.parse(raw);
  const base = slugKey(input.name).replace(/_/g, "-").replace(/:/g, "") || "project";
  let slug = base;
  for (let i = 2; await prisma.project.findUnique({ where: { slug }, select: { id: true } }); i++) slug = `${base}-${i}`;

  const visitorId = await getVisitorId();
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: { slug, name: input.name, description: input.description, visitorId, expiresAt: visitorId ? new Date(Date.now() + PROJECT_TTL_MS) : null },
    });
    const people: Record<string, string> = {};
    for (const p of Object.values(PERSONAS)) {
      const row = await tx.person.create({
        data: { projectId: project.id, name: p.name, roleTitle: p.roleTitle, handles: [p.key, p.name] },
      });
      people[p.key] = row.id;
    }
    const handover = await tx.handover.create({
      data: {
        projectId: project.id,
        fromPersonId: people.meera,
        toPersonId: people.arjun,
        reviewerPersonId: people.rao,
        status: "DRAFT",
      },
    });
    await writeAudit(tx, { projectId: project.id, actor, action: "project.create", targetType: "Project", targetId: project.id, meta: { slug } });
    return { project, handoverId: handover.id };
  });
}

/* ------------------------------------------------------------------------- */
/* Persist raw sources (shared by uploads and GitHub import)                  */
/* ------------------------------------------------------------------------- */

/** People + one redactor per transaction, so placeholder numbers continue across every source in it. */
async function persistContext(tx: Prisma.TransactionClient, projectId: string) {
  const people = await tx.person.findMany({ where: { projectId } });
  const peopleInput: PersonInput[] = people.map((p) => ({ key: p.id, name: p.name, handles: p.handles, email: p.email ?? undefined }));
  const existing = await tx.redaction.groupBy({
    by: ["kind"],
    where: { chunk: { source: { projectId } } },
    _count: { _all: true },
  });
  const start: Partial<Record<RedactionKind, number>> = Object.fromEntries(existing.map((e) => [e.kind, e._count._all]));
  const redactor = new Redactor(`${randomId("red")}_`, start);
  const authorName = (h?: string) => {
    if (!h) return null;
    const n = h.toLowerCase();
    return people.find((p) => p.name.toLowerCase() === n || p.handles.some((x) => x.toLowerCase() === n))?.name ?? h;
  };
  return { peopleInput, redactor, authorName };
}

type PersistCtx = Awaited<ReturnType<typeof persistContext>>;

async function writeChunks(tx: Prisma.TransactionClient, chunks: NormalisedChunk[]) {
  await tx.chunk.createMany({
    data: chunks.map((c) => ({
      id: c.id,
      sourceId: c.sourceKey,
      ordinal: c.ordinal,
      text: c.text,
      locator: c.locator,
      author: c.author,
      timestamp: c.timestamp ? new Date(c.timestamp) : null,
      access: c.access,
      meta: c.links?.length ? { links: c.links } : {},
    })),
  });
  const redactions = chunks.flatMap((c) => c.redactions.map((r) => ({ id: r.id, chunkId: c.id, kind: r.kind, placeholder: r.placeholder, mentionedBy: r.mentionedBy })));
  if (redactions.length) await tx.redaction.createMany({ data: redactions });
  return redactions.length;
}

async function persistRawSources(tx: Prisma.TransactionClient, projectId: string, raw: RawSource[], ctx?: PersistCtx) {
  const { peopleInput, redactor, authorName } = ctx ?? (await persistContext(tx, projectId));
  const { chunks } = normaliseSources(raw, peopleInput, { redactor, chunkId: (k, i) => `${k.replace(/^src_/, "chk_")}_${i}` });

  await tx.source.createMany({
    data: raw.map((s) => ({
      id: s.key,
      projectId,
      kind: s.kind,
      title: s.title.slice(0, 300),
      uri: s.uri ?? null,
      access: s.access,
      authoritative: s.authoritative,
      author: authorName(s.author),
      createdAt: s.createdAt,
      grantedToIncoming: !!s.grantedToIncoming,
      externalId: s.externalId ?? null,
      meta: s.externalId ? { seen: s.items.map(itemKey) } : {},
    })),
  });
  const redactions = await writeChunks(tx, chunks);
  return { sources: raw.length, chunks: chunks.length, redactions, chunkIds: chunks.map((c) => c.id) };
}

export type AppendResult = {
  newSources: string[];
  updatedSources: string[];
  newItems: number;
  skippedItems: number;
  newChunkIds: string[];
  redactions: number;
};

/**
 * Incremental ingest. A raw source whose externalId already exists in the project gets only the
 * items it has not seen (by item key) appended as new chunks; otherwise it is created. Items go
 * through the same redaction and chunking as a first import. Running it twice adds nothing.
 */
export async function appendRawSources(tx: Prisma.TransactionClient, projectId: string, raw: RawSource[]): Promise<AppendResult> {
  const ctx = await persistContext(tx, projectId);
  const out: AppendResult = { newSources: [], updatedSources: [], newItems: 0, skippedItems: 0, newChunkIds: [], redactions: 0 };
  const create: RawSource[] = [];
  for (const s of raw) {
    if (!s.items.length) continue;
    const existing = s.externalId
      ? await tx.source.findUnique({ where: { projectId_externalId: { projectId, externalId: s.externalId } } })
      : null;
    if (!existing) {
      // Dedupe items inside one batch too.
      const seen = new Set<string>();
      const items = s.items.filter((it) => (seen.has(itemKey(it)) ? false : (seen.add(itemKey(it)), true)));
      create.push({ ...s, items });
      out.newItems += items.length;
      continue;
    }
    const seen = new Set(((existing.meta as { seen?: string[] } | null)?.seen ?? []) as string[]);
    const fresh = s.items.filter((it) => !seen.has(itemKey(it)));
    out.skippedItems += s.items.length - fresh.length;
    if (!fresh.length) continue;
    const max = await tx.chunk.aggregate({ where: { sourceId: existing.id }, _max: { ordinal: true } });
    const base = (max._max.ordinal ?? -1) + 1;
    const { chunks } = normaliseSources([{ ...s, key: existing.id, access: existing.access, items: fresh }], ctx.peopleInput, {
      redactor: ctx.redactor,
      chunkId: (k, i) => `${k.replace(/^src_/, "chk_")}_${base + i}`,
    });
    const shifted = chunks.map((c) => ({ ...c, ordinal: c.ordinal + base }));
    out.redactions += await writeChunks(tx, shifted);
    await tx.source.update({
      where: { id: existing.id },
      data: { meta: { ...((existing.meta as object) ?? {}), seen: [...seen, ...fresh.map(itemKey)] } },
    });
    out.updatedSources.push(existing.id);
    out.newItems += fresh.length;
    out.newChunkIds.push(...shifted.map((c) => c.id));
  }
  if (create.length) {
    const r = await persistRawSources(tx, projectId, create, ctx);
    out.newSources.push(...create.map((s) => s.key));
    out.newChunkIds.push(...r.chunkIds);
    out.redactions += r.redactions;
  }
  return out;
}

/* ------------------------------------------------------------------------- */
/* Uploads                                                                    */
/* ------------------------------------------------------------------------- */

export const UploadMeta = z.object({
  access: AccessEnum.default("TEAM"),
  authoritative: z.boolean().default(false),
});

export async function uploadSources(actor: Actor, projectId: string, files: UploadFile[], meta: unknown) {
  assertCan(actor, "connect_sources");
  const m = UploadMeta.parse(meta);
  if (!files.length) throw new BadRequestError("Choose at least one file.");
  if (files.length > MAX_FILES) throw new BadRequestError(`Upload at most ${MAX_FILES} files at a time.`);

  const raw: RawSource[] = [];
  for (const f of files) {
    raw.push(...(await fileToRawSources(f, { access: m.access, authoritative: m.authoritative, key: () => randomId("src") })));
  }
  if (!raw.some((s) => s.items.length)) throw new BadRequestError("No readable text found in the uploaded files.");
  const counts = await prisma.$transaction(async (tx) => {
    const c = await persistRawSources(tx, projectId, raw.filter((s) => s.items.length));
    await writeAudit(tx, {
      projectId,
      actor,
      action: "sources.upload",
      targetType: "Project",
      targetId: projectId,
      meta: { files: files.map((f) => f.name), access: m.access, ...c },
    });
    return c;
  }, TX);
  return { ...counts, sourceIds: raw.map((s) => s.key) };
}

/* ------------------------------------------------------------------------- */
/* GitHub                                                                     */
/* ------------------------------------------------------------------------- */

export const GithubInput = z.object({
  url: z.string().trim().min(3).max(200),
  access: AccessEnum.default("PUBLIC"),
});

export async function importGithub(actor: Actor, projectId: string, rawInput: unknown) {
  assertCan(actor, "connect_sources");
  const input = GithubInput.parse(rawInput);
  const imp = await importGithubRepo(input.url, {
    token: process.env.GITHUB_TOKEN?.trim() || undefined,
    access: input.access,
    key: () => randomId("src"),
  });
  if (!imp.sources.length) throw new BadRequestError(`${imp.repo} has no commits, PRs, issues or README to import.`);
  const counts = await prisma.$transaction(async (tx) => {
    // Incremental: importing the same repo again only adds items that are not stored yet.
    const r = await appendRawSources(tx, projectId, imp.sources.filter((s) => s.items.length));
    const c = { sources: r.newSources.length + r.updatedSources.length, chunks: r.newChunkIds.length, redactions: r.redactions, skippedItems: r.skippedItems };
    // Remember where we are, so "Sync now" and the webhook only fetch what changed after this import.
    await tx.syncState.upsert({
      where: { projectId_provider_externalKey: { projectId, provider: "github", externalKey: imp.repo } },
      create: { projectId, provider: "github", externalKey: imp.repo, cursor: imp.cursor, lastSyncedAt: new Date(), lastStatus: "imported" },
      update: { cursor: imp.cursor, lastSyncedAt: new Date(), lastStatus: "imported", lastError: null },
    });
    await writeAudit(tx, {
      projectId,
      actor,
      action: "sources.github_import",
      targetType: "Project",
      targetId: projectId,
      meta: { repo: imp.repo, ...imp.counts, ...c },
    });
    return { ...c, sourceIds: [...r.newSources, ...r.updatedSources] };
  }, TX);
  if (!counts.chunks && counts.skippedItems) throw new BadRequestError(`${imp.repo} is already imported and nothing changed since. Use Sync now to check for new activity.`);
  return { repo: imp.repo, imported: imp.counts, ...counts };
}

/* ------------------------------------------------------------------------- */
/* Labels and per-source grants                                               */
/* ------------------------------------------------------------------------- */

export const LabelInput = z
  .object({
    access: AccessEnum.optional(),
    authoritative: z.boolean().optional(),
    grantedToIncoming: z.boolean().optional(),
  })
  .refine((v) => v.access !== undefined || v.authoritative !== undefined || v.grantedToIncoming !== undefined, {
    message: "Nothing to change",
  });

/** Change a source's access label / authority / INCOMING grant. Chunks inherit; claims are re-graded. */
export async function labelSource(actor: Actor, projectId: string, sourceId: string, raw: unknown) {
  assertCan(actor, "label_sources");
  const input = LabelInput.parse(raw);
  const src = await prisma.source.findFirst({ where: { id: sourceId, projectId } });
  if (!src) throw new NotFoundError("Source");
  if (src.kind === "TESTIMONY" && input.access === "PUBLIC") {
    throw new ConflictError("Testimony cannot be made public.");
  }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.source.update({
      where: { id: sourceId },
      data: {
        access: input.access ?? undefined,
        authoritative: input.authoritative ?? undefined,
        grantedToIncoming: input.grantedToIncoming ?? undefined,
      },
    });
    if (input.access && input.access !== src.access) {
      await tx.chunk.updateMany({ where: { sourceId }, data: { access: input.access as Access } });
    }
    const affected = await tx.evidence.findMany({ where: { chunk: { sourceId } }, select: { claimId: true } });
    const changed = await regradeClaims(tx, projectId, [...new Set(affected.map((a) => a.claimId))]);
    await writeAudit(tx, {
      projectId,
      actor,
      action: input.grantedToIncoming !== undefined && input.access === undefined && input.authoritative === undefined ? (input.grantedToIncoming ? "access.grant" : "access.revoke") : "source.label",
      targetType: "Source",
      targetId: sourceId,
      meta: { before: { access: src.access, authoritative: src.authoritative, grantedToIncoming: src.grantedToIncoming }, after: input, regraded: changed.length },
    });
    return { source: updated, regraded: changed.length };
  }, TX);
}
