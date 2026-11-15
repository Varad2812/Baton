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
import { normaliseSources, Redactor, type PersonInput, type RawSource } from "./normalise";
import { regradeClaims, TX } from "./store";

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

  return prisma.$transaction(async (tx) => {
    const project = await tx.project.create({ data: { slug, name: input.name, description: input.description } });
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

async function persistRawSources(tx: Prisma.TransactionClient, projectId: string, raw: RawSource[]) {
  const people = await tx.person.findMany({ where: { projectId } });
  const peopleInput: PersonInput[] = people.map((p) => ({ key: p.id, name: p.name, handles: p.handles, email: p.email ?? undefined }));
  const existing = await tx.redaction.groupBy({
    by: ["kind"],
    where: { chunk: { source: { projectId } } },
    _count: { _all: true },
  });
  const start: Partial<Record<RedactionKind, number>> = Object.fromEntries(existing.map((e) => [e.kind, e._count._all]));
  const redactor = new Redactor(`${randomId("red")}_`, start);
  const { chunks } = normaliseSources(raw, peopleInput, { redactor, chunkId: (k, i) => `${k.replace(/^src_/, "chk_")}_${i}` });

  const authorName = (h?: string) => {
    if (!h) return null;
    const n = h.toLowerCase();
    return people.find((p) => p.name.toLowerCase() === n || p.handles.some((x) => x.toLowerCase() === n))?.name ?? h;
  };

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
    })),
  });
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
    })),
  });
  const redactions = chunks.flatMap((c) => c.redactions.map((r) => ({ id: r.id, chunkId: c.id, kind: r.kind, placeholder: r.placeholder, mentionedBy: r.mentionedBy })));
  if (redactions.length) await tx.redaction.createMany({ data: redactions });
  return { sources: raw.length, chunks: chunks.length, redactions: redactions.length };
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
    const c = await persistRawSources(tx, projectId, imp.sources.filter((s) => s.items.length));
    await writeAudit(tx, {
      projectId,
      actor,
      action: "sources.github_import",
      targetType: "Project",
      targetId: projectId,
      meta: { repo: imp.repo, ...imp.counts, ...c },
    });
    return c;
  }, TX);
  return { repo: imp.repo, imported: imp.counts, ...counts, sourceIds: imp.sources.filter((s) => s.items.length).map((s) => s.key) };
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
