// Handover page data. One renderer for both states: the approved RoleView stored for the viewer's role
// (immutable, compiled at approval) or, before any approval, a live draft preview compiled with the
// same compileView() and the deterministic template writer. Never a second compiler.
import type { ClaimType, Grade } from "@/generated/prisma/enums";
import { allowedAccess, canSeeClaim, type Actor } from "@/lib/authz";
import { prisma } from "@/lib/db";
import type { CompiledView, PlanItem as CompiledPlanItem, Snapshot } from "@/lib/handover/compile";
import { getRoleView, previewRoleView } from "@/lib/handover/service";
import { findQuote } from "@/lib/pipeline/quotes";
import type { ClaimFull } from "@/lib/views/claims";
import { citationLabel, fmtDate } from "@/lib/views/format";

export type Citation = { label: string; chunkId: string; quote: string };

/** Citation chips for a claim loaded with `claimInclude` (ledger, interview). */
export function citationsFor(c: ClaimFull): Citation[] {
  const seen = new Set<string>();
  const out: Citation[] = [];
  for (const e of c.evidence) {
    if (e.relation !== "SUPPORTS") continue;
    const label = citationLabel(e.chunk.source, e.chunk, e.matchStart);
    if (seen.has(label)) continue;
    seen.add(label);
    out.push({ label, chunkId: e.chunkId, quote: e.quote });
  }
  return out;
}

export type PlanKind = "conflict" | "risk" | "task" | "missing" | "inferred" | "recurring";
export type PlanItem = { id: string; text: string; claimId: string | null; kind: PlanKind; citations: Citation[] };
export type HandoverClaim = {
  id: string;
  title: string;
  statement: string;
  grade: Grade;
  type: ClaimType;
  date: string | null;
  owner: string | null;
  fromTestimony: boolean;
  citations: Citation[];
};
export type HandoverSection = { name: string; hidden: number; claims: HandoverClaim[] };

const GRADE_RANK: Grade[] = ["CONFLICTING", "MISSING", "VERIFIED", "SINGLE_SOURCE", "INFERRED"];

function planKind(c: { grade: Grade; type: ClaimType } | undefined): PlanKind {
  if (!c) return "task";
  if (c.grade === "CONFLICTING") return "conflict";
  if (c.grade === "MISSING") return "missing";
  if (c.grade === "INFERRED") return "inferred";
  if (c.type === "RISK") return "risk";
  if (c.type === "RECURRING") return "recurring";
  return "task";
}

export async function getHandoverPage(projectId: string, actor: Actor) {
  // Independent reads in parallel (each is a round trip to the DB).
  const [handover, allowed, latestChunk, requests] = await Promise.all([
    prisma.handover.findFirst({
      where: { projectId },
      orderBy: { id: "asc" },
      include: {
        from: true,
        to: true,
        reviewer: true,
        versions: { orderBy: { number: "desc" }, select: { id: true, number: true, approvedAt: true, note: true, snapshot: true, approvedBy: { select: { name: true } }, _count: { select: { acknowledgements: true } } } },
        followUps: {
          orderBy: { createdAt: "desc" },
          include: {
            askedBy: { select: { name: true } },
            claim: { select: { id: true, title: true, access: true, evidence: { select: { chunk: { select: { access: true, sourceId: true } } } } } },
          },
        },
      },
    }),
    allowedAccess(actor.role, projectId),
    prisma.chunk.findFirst({
      // "Records as of" = newest record, not interview testimony recorded today.
      where: { source: { projectId, kind: { not: "TESTIMONY" } }, timestamp: { not: null } },
      orderBy: { timestamp: "desc" },
      select: { timestamp: true },
    }),
    prisma.auditLog.findMany({ where: { projectId, action: "access.requested", actorName: actor.name }, select: { meta: true, at: true } }),
  ]);
  if (!handover) return null;

  // Stored RoleView of the latest approved version, else the live draft preview (same compiler).
  const stored = handover.currentVersion ? await getRoleView(actor, projectId) : null;
  const mode: "approved" | "draft" = stored?.view ? "approved" : "draft";
  const compiled: CompiledView = stored?.view ? stored.view.compiled : (await previewRoleView(actor, projectId)).view.compiled;
  const version = stored?.version ?? null;
  const approval = version ? ((handover.versions.find((v) => v.number === version.number)?.snapshot as unknown as Snapshot | null)?.approval ?? null) : null;

  // Citation labels from the chunks the compiled view cites (all within the role's access by construction).
  const items = compiled.sections.flatMap((s) => s.items);
  const chunkIds = [...new Set(items.flatMap((c) => c.evidence.map((e) => e.chunkId)))];
  const chunks = await prisma.chunk.findMany({
    where: { id: { in: chunkIds } },
    select: { id: true, locator: true, timestamp: true, text: true, source: { select: { kind: true, title: true } } },
  });
  const chunkById = new Map(chunks.map((c) => [c.id, c]));
  const cites = (c: CompiledView["sections"][number]["items"][number]): Citation[] => {
    const seen = new Set<string>();
    const out: Citation[] = [];
    for (const e of c.evidence) {
      if (e.relation !== "SUPPORTS") continue;
      const ch = chunkById.get(e.chunkId);
      const label = ch ? citationLabel(ch.source, ch, findQuote(ch.text, e.quote)?.start ?? null) : e.locator;
      if (seen.has(label)) continue;
      seen.add(label);
      out.push({ label, chunkId: e.chunkId, quote: e.quote });
    }
    return out;
  };

  const claimById = new Map<string, HandoverClaim>();
  const sections: HandoverSection[] = compiled.sections.map((s) => ({
    name: s.section,
    hidden: s.hidden,
    claims: s.items
      .map((c) => {
        const hc: HandoverClaim = {
          id: c.id,
          title: c.title,
          statement: c.statement,
          grade: c.grade,
          type: c.type,
          date: c.date,
          owner: c.owner,
          fromTestimony: c.fromTestimony,
          citations: cites(c),
        };
        claimById.set(c.id, hc);
        return hc;
      })
      .sort((a, b) => GRADE_RANK.indexOf(a.grade) - GRADE_RANK.indexOf(b.grade) || (b.date ?? "").localeCompare(a.date ?? "")),
  }));

  const plan = (list: CompiledPlanItem[], prefix: string): PlanItem[] =>
    list.map((p, i) => {
      const first = p.claimIds.map((id) => claimById.get(id)).find(Boolean);
      return {
        id: `${prefix}-${i}`,
        text: p.text,
        claimId: first?.id ?? null,
        kind: planKind(first),
        citations: p.claimIds.flatMap((id) => claimById.get(id)?.citations.slice(0, 1) ?? []).slice(0, 3),
      };
    });

  const all = [...claimById.values()];
  const counts = {
    claims: all.length,
    verified: all.filter((c) => c.grade === "VERIFIED").length,
    risks: all.filter((c) => c.type === "RISK" && c.grade !== "MISSING").length,
    missing: all.filter((c) => c.grade === "MISSING").length,
    conflicts: compiled.openConflicts.length,
  };

  // Follow-ups: only those about claims this role may see now (or about a section).
  const followUps = handover.followUps
    .filter((f) => !f.claim || canSeeClaim(allowed, f.claim))
    .map((f) => ({
      id: f.id,
      question: f.question,
      section: f.section,
      claim: f.claim ? { id: f.claim.id, title: f.claim.title } : null,
      askedBy: f.askedBy.name,
      answer: f.answer,
      answeredAt: f.answeredAt,
      createdAt: f.createdAt,
    }));

  const asOf = latestChunk?.timestamp ?? new Date();
  const acks = (stored?.acknowledgements ?? []).filter((a) => a.person === handover.to.name);

  return {
    mode,
    asOf,
    asOfLabel: fmtDate(asOf),
    handover: { id: handover.id, status: handover.status, currentVersion: handover.currentVersion, from: handover.from, to: handover.to, reviewer: handover.reviewer },
    version: version ? { ...version, approval } : null,
    versions: handover.versions.map((v) => ({ number: v.number, approvedBy: v.approvedBy?.name ?? null, approvedAt: v.approvedAt, note: v.note, acks: v._count.acknowledgements })),
    overview: compiled.overview,
    writer: compiled.writer,
    canary: compiled.canary,
    hiddenCount: compiled.hiddenCount,
    sections,
    plan7: plan(compiled.plan7, "p7"),
    plan30: plan(compiled.plan30, "p30"),
    openConflicts: compiled.openConflicts,
    counts,
    sourceChunkIds: chunkIds,
    acknowledgements: acks.map((a) => ({ section: a.section, at: a.at })),
    acknowledged: acks.map((a) => a.section),
    accessRequested: requests.map((r) => ((r.meta as { section?: string | null } | null)?.section ?? "") as string),
    followUps,
  };
}

export type HandoverPageData = NonNullable<Awaited<ReturnType<typeof getHandoverPage>>>;
