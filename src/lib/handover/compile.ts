// Role compilation. From an immutable snapshot, keep only claims whose evidence chunks are ALL
// visible to the role; everything else counts toward hiddenCount. The writer (LLM) receives only
// the allowed claims and quotes. Afterwards the output is scanned for every canary string found in
// non-allowed chunks (and for hidden quotes); any hit discards the model text in favour of the
// deterministic template, which is built from allowed claims only.

import { z } from "zod";
import type { Access, ClaimType, Grade, Role } from "@/generated/prisma/enums";
import { canSeeChunk, canSeeClaim, type AllowedAccess } from "@/lib/authz";
import { llmJson, LlmInvalidOutputError, LlmUnavailableError, type LlmRunCtx } from "@/lib/llm";
import { SECTIONS } from "@/lib/pipeline/checklist";
import { normaliseForMatch } from "@/lib/pipeline/quotes";

/* ------------------------------------------------------------------------- */
/* Snapshot (stored in HandoverVersion.snapshot, never mutated)               */
/* ------------------------------------------------------------------------- */

export type SnapshotEvidence = {
  chunkId: string;
  sourceId: string;
  sourceTitle: string;
  sourceKind: string;
  access: Access;
  locator: string;
  quote: string;
  relation: "SUPPORTS" | "CONTRADICTS";
};

export type SnapshotClaim = {
  id: string;
  type: ClaimType;
  section: string;
  title: string;
  statement: string;
  topicKey: string;
  grade: Grade;
  gradeReason: string;
  status: string;
  access: Access;
  fromTestimony: boolean;
  owner: string | null;
  date: string | null;
  reviewerNote: string | null;
  evidence: SnapshotEvidence[];
};

export type Snapshot = {
  schema: 1;
  projectId: string;
  projectName: string;
  createdAt: string;
  handover: { from: string; to: string; reviewer: string };
  claims: SnapshotClaim[];
  conflicts: { id: string; topicKey: string; claimAId: string; claimBId: string; kind: string; status: string; resolution: string | null; note: string | null }[];
  answeredQuestions: { id: string; question: string; answer: string; relatedClaimId: string | null }[];
};

/* ------------------------------------------------------------------------- */
/* Compiled view (RoleView.compiled)                                          */
/* ------------------------------------------------------------------------- */

export type PlanItem = { text: string; claimIds: string[] };

export type CompiledView = {
  role: Role;
  overview: string;
  sections: {
    section: string;
    items: Omit<SnapshotClaim, "access" | "topicKey" | "status">[];
    hidden: number;
  }[];
  plan7: PlanItem[];
  plan30: PlanItem[];
  openConflicts: { id: string; topicKey: string; a: string; b: string }[];
  hiddenCount: number;
  writer: "model" | "template";
  canary: { checked: number; hits: number; fallback: boolean };
};

export type ChunkForScan = { id: string; sourceId: string; access: Access; text: string };

export type WriterInput = {
  projectName: string;
  from: string;
  to: string;
  role: Role;
  claims: { id: string; type: ClaimType; section: string; title: string; statement: string; grade: Grade; date: string | null; owner: string | null; quotes: string[] }[];
  openConflicts: { a: string; b: string }[];
};

export type WriterOutput = { overview: string; plan7: PlanItem[]; plan30: PlanItem[] };
export type Writer = (input: WriterInput) => Promise<WriterOutput>;

const CANARY_RE = /CANARY-[A-Z0-9]+(?:-[A-Z0-9]+)*/g;

/**
 * Strings that must never appear in a view compiled for `allowed`: canaries found in chunks the
 * role cannot see, and quotes of hidden claims. A string that also occurs in material the role IS
 * allowed to see (an allowed chunk, or a visible claim) is not secret and is not counted.
 */
export function forbiddenStrings(
  allowed: AllowedAccess,
  chunks: ChunkForScan[],
  hiddenClaims: SnapshotClaim[],
  extraCanaries: string[] = [],
  visibleClaims: SnapshotClaim[] = [],
): string[] {
  const allowedText = normaliseForMatch(
    [
      ...chunks.filter((c) => canSeeChunk(allowed, c)).map((c) => c.text),
      ...visibleClaims.map((c) => `${c.title} ${c.statement}`),
    ].join("\n"),
  );
  const out = new Set<string>();
  for (const c of chunks) {
    if (canSeeChunk(allowed, c)) continue;
    for (const m of c.text.match(CANARY_RE) ?? []) out.add(m);
    for (const x of extraCanaries) if (x && c.text.includes(x)) out.add(x);
  }
  for (const cl of hiddenClaims) {
    for (const e of cl.evidence) if (normaliseForMatch(e.quote).length >= 24) out.add(e.quote);
  }
  return [...out].filter((f) => !allowedText.includes(normaliseForMatch(f)));
}

export function scanForLeaks(output: unknown, forbidden: string[]): string[] {
  const hay = normaliseForMatch(JSON.stringify(output));
  return forbidden.filter((f) => hay.includes(normaliseForMatch(f)));
}

/** Deterministic, leak-free writer: uses only the claims it is given. */
export const templateWriter: Writer = async (inp) => {
  const by = (g: Grade) => inp.claims.filter((c) => c.grade === g).length;
  const purpose = inp.claims.find((c) => c.section === "Purpose & status");
  const overview = [
    `${inp.projectName}: handover from ${inp.from} to ${inp.to}.`,
    purpose ? purpose.statement : null,
    `${inp.claims.length} claims at your access level: ${by("VERIFIED")} verified, ${by("SINGLE_SOURCE")} single-source, ${by("INFERRED")} inferred, ${by("CONFLICTING")} in open conflicts, ${by("MISSING")} open gaps.`,
  ]
    .filter(Boolean)
    .join(" ");

  const plan7: PlanItem[] = [];
  for (const cf of inp.openConflicts) {
    const a = inp.claims.find((c) => c.title === cf.a);
    const b = inp.claims.find((c) => c.title === cf.b);
    if (a && b) plan7.push({ text: `Settle the open conflict: "${a.title}" vs "${b.title}".`, claimIds: [a.id, b.id] });
  }
  for (const c of inp.claims.filter((x) => x.grade === "MISSING")) {
    plan7.push({ text: `Find out and record: ${c.title.replace(/^No record:\s*/i, "")}.`, claimIds: [c.id] });
  }
  const deadlines = inp.claims.filter((c) => c.section === "Deadlines").sort((x, y) => (x.date ?? "9").localeCompare(y.date ?? "9"));
  for (const c of deadlines) plan7.push({ text: `Deadline${c.date ? ` ${c.date}` : ""}: ${c.title}.`, claimIds: [c.id] });

  const plan30: PlanItem[] = [];
  for (const c of inp.claims.filter((x) => x.type === "TASK" && x.grade !== "MISSING")) {
    plan30.push({ text: `Take over: ${c.title}${c.owner ? ` (was ${c.owner})` : ""}.`, claimIds: [c.id] });
  }
  for (const c of inp.claims.filter((x) => x.type === "RISK" && x.grade !== "MISSING")) plan30.push({ text: `Reduce risk: ${c.title}.`, claimIds: [c.id] });
  for (const c of inp.claims.filter((x) => x.type === "RECURRING")) plan30.push({ text: `Fix for good: ${c.title}.`, claimIds: [c.id] });

  return { overview, plan7: plan7.slice(0, 7), plan30: plan30.slice(0, 8) };
};

/* ------------------------------------------------------------------------- */
/* LLM writer                                                                 */
/* ------------------------------------------------------------------------- */

export const WriterSchema = z.object({
  overview: z.string().describe("3-5 sentences: what the project is, its state, what needs attention first"),
  plan7: z.array(z.object({ text: z.string(), claimIds: z.array(z.string()) })).max(7),
  plan30: z.array(z.object({ text: z.string(), claimIds: z.array(z.string()) })).max(8),
});

const WRITER_SYSTEM = `You write the opening of a project handover for a successor.
Use ONLY the claims provided; every plan item must cite the ids of the claims it is based on.
Do not invent facts, names, dates or numbers. Mention open conflicts and gaps honestly.
plan7 = the first 7 days (urgent: conflicts, gaps, near deadlines); plan30 = the first 30 days.`;

export function modelWriter(ctx: LlmRunCtx): Writer {
  return async (inp) => {
    const prompt = `Project: ${inp.projectName}. Handover from ${inp.from} to ${inp.to}. Reader role: ${inp.role}.
Open conflicts: ${inp.openConflicts.map((c) => `"${c.a}" vs "${c.b}"`).join("; ") || "none"}.
Claims:
${inp.claims
  .map((c) => `- id=${c.id} [${c.type}/${c.grade}${c.date ? `/${c.date}` : ""}${c.owner ? `/owner ${c.owner}` : ""}] (${c.section}) ${c.title}. ${c.statement}`)
  .join("\n")}`;
    return llmJson({ name: `compile:${inp.role}`, system: WRITER_SYSTEM, prompt, schema: WriterSchema, temperature: 0.3 }, ctx);
  };
}

/* ------------------------------------------------------------------------- */
/* Compile                                                                    */
/* ------------------------------------------------------------------------- */

export async function compileView(opts: {
  snapshot: Snapshot;
  role: Role;
  allowed: AllowedAccess;
  chunks: ChunkForScan[];
  writer?: Writer;
  extraCanaries?: string[];
}): Promise<{ compiled: CompiledView; hiddenCount: number; sourceChunkIds: string[]; writerInput: WriterInput }> {
  const { snapshot, role, allowed } = opts;
  const visible: SnapshotClaim[] = [];
  const hidden: SnapshotClaim[] = [];
  for (const c of snapshot.claims) {
    const ok = canSeeClaim(allowed, { access: c.access, evidence: c.evidence.map((e) => ({ chunk: { access: e.access, sourceId: e.sourceId } })) });
    (ok ? visible : hidden).push(c);
  }
  const visibleIds = new Set(visible.map((c) => c.id));
  const titleOf = new Map(visible.map((c) => [c.id, c.title]));

  const openConflicts = snapshot.conflicts
    .filter((c) => c.kind === "CONTRADICTS" && c.status === "OPEN" && visibleIds.has(c.claimAId) && visibleIds.has(c.claimBId))
    .map((c) => ({ id: c.id, topicKey: c.topicKey, a: titleOf.get(c.claimAId)!, b: titleOf.get(c.claimBId)! }));

  const writerInput: WriterInput = {
    projectName: snapshot.projectName,
    from: snapshot.handover.from,
    to: snapshot.handover.to,
    role,
    claims: visible.map((c) => ({
      id: c.id,
      type: c.type,
      section: c.section,
      title: c.title,
      statement: c.statement,
      grade: c.grade,
      date: c.date,
      owner: c.owner,
      quotes: c.evidence.map((e) => e.quote),
    })),
    openConflicts: openConflicts.map(({ a, b }) => ({ a, b })),
  };

  const sectionNames = [...SECTIONS, ...new Set(snapshot.claims.map((c) => c.section).filter((s) => !(SECTIONS as readonly string[]).includes(s)))];
  const sections = sectionNames
    .map((section) => ({
      section,
      items: visible
        .filter((c) => c.section === section)
        .map((c) => ({
          id: c.id,
          type: c.type,
          section: c.section,
          title: c.title,
          statement: c.statement,
          grade: c.grade,
          gradeReason: c.gradeReason,
          fromTestimony: c.fromTestimony,
          owner: c.owner,
          date: c.date,
          reviewerNote: c.reviewerNote,
          evidence: c.evidence,
        })),
      hidden: hidden.filter((c) => c.section === section).length,
    }))
    .filter((s) => s.items.length || s.hidden);

  const forbidden = forbiddenStrings(allowed, opts.chunks, hidden, opts.extraCanaries, visible);
  const cleanPlan = (items: PlanItem[]) =>
    items
      .map((i) => ({ text: i.text.trim(), claimIds: [...new Set(i.claimIds.filter((id) => visibleIds.has(id)))] }))
      .filter((i) => i.text && i.claimIds.length);

  const template = await templateWriter(writerInput);
  let written: WriterOutput = template;
  let writer: CompiledView["writer"] = "template";
  if (opts.writer && opts.writer !== templateWriter) {
    try {
      const out = await opts.writer(writerInput);
      const plan7 = cleanPlan(out.plan7);
      const plan30 = cleanPlan(out.plan30);
      written = {
        overview: out.overview.trim() || template.overview,
        plan7: plan7.length ? plan7 : template.plan7,
        plan30: plan30.length ? plan30 : template.plan30,
      };
      writer = "model";
    } catch (e) {
      if (!(e instanceof LlmUnavailableError || e instanceof LlmInvalidOutputError)) throw e;
    }
  }

  const build = (w: WriterOutput, by: CompiledView["writer"]): CompiledView => ({
    role,
    overview: w.overview,
    sections,
    plan7: w.plan7,
    plan30: w.plan30,
    openConflicts,
    hiddenCount: hidden.length,
    writer: by,
    canary: { checked: forbidden.length, hits: 0, fallback: false },
  });

  let compiled = build(written, writer);
  let hits = scanForLeaks(compiled, forbidden);
  if (hits.length && writer === "model") {
    compiled = build(template, "template");
    compiled.canary.fallback = true;
    hits = scanForLeaks(compiled, forbidden);
  }
  compiled.canary.hits = hits.length;

  return {
    compiled,
    hiddenCount: hidden.length,
    sourceChunkIds: [...new Set(visible.flatMap((c) => c.evidence.map((e) => e.chunkId)))],
    writerInput,
  };
}
