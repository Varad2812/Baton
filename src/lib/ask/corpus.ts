// "Ask the handover" corpus (DB). Built ONLY from:
//   - the facts in the viewer's own role view of the latest approved version (else the draft preview),
//     re-checked against the viewer's CURRENT access (a grant revoked after approval hides them again);
//   - the source excerpts those facts cite, if the viewer may see each excerpt;
//   - testimony recorded after approval (answers to follow-ups) that the viewer may see.
// Everything else only counts toward `forbidden` (canaries in hidden excerpts, quotes of hidden facts).
import { allowedAccess, can, canSeeChunk, canSeeClaim, type Actor } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { forbiddenStrings, type ChunkForScan, type SnapshotClaim } from "@/lib/handover/compile";
import type { Snapshot } from "@/lib/handover/compile";
import { getRoleView, previewRoleView } from "@/lib/handover/service";
import { findQuote } from "@/lib/pipeline/quotes";
import { citationLabel } from "@/lib/views/format";
import type { AskCorpus, AskDoc } from "./types";

type ChunkRow = ChunkForScan & { locator: string; timestamp: Date | null; source: { kind: Parameters<typeof citationLabel>[0]["kind"]; title: string; createdAt: Date } };

export async function loadAskCorpus(actor: Actor, projectId: string): Promise<AskCorpus> {
  const [handover, allowed, chunkRows, liveClaims] = await Promise.all([
    prisma.handover.findFirst({ where: { projectId }, orderBy: { id: "asc" }, include: { from: true } }),
    allowedAccess(actor.role, projectId),
    prisma.chunk.findMany({
      where: { source: { projectId } },
      select: { id: true, sourceId: true, access: true, text: true, locator: true, timestamp: true, source: { select: { kind: true, title: true, createdAt: true } } },
    }) as Promise<ChunkRow[]>,
    prisma.claim.findMany({
      where: { projectId },
      select: { id: true, title: true, statement: true, access: true, status: true, evidence: { select: { quote: true, chunkId: true, chunk: { select: { access: true, sourceId: true } } } } },
    }),
  ]);
  const owner = handover?.from.name ?? "the owner";
  const base = { owner: { first: owner.split(" ")[0], full: owner }, canAskOwner: can(actor.role, "ask_followups") };

  const stored = handover?.currentVersion ? await getRoleView(actor, projectId) : null;
  const compiled = stored?.view?.compiled ?? (handover ? (await previewRoleView(actor, projectId)).view.compiled : null);
  const mode: AskCorpus["mode"] = stored?.view ? "approved" : "draft";
  const approvedAt = stored?.version?.approvedAt ?? null;

  const chunkById = new Map(chunkRows.map((c) => [c.id, c]));
  const visibleChunk = (id: string) => {
    const c = chunkById.get(id);
    return c && canSeeChunk(allowed, c) ? c : null;
  };
  // Testimony excerpts: search and quote the answer, not the question that prompted it.
  const body = (c: ChunkRow) => {
    if (c.source.kind !== "TESTIMONY") return c.text;
    const at = c.text.search(/\nA \(/);
    return at >= 0 ? c.text.slice(at + 1) : c.text;
  };
  const label = (c: ChunkRow, quote?: string) => citationLabel(c.source, c, quote ? (findQuote(c.text, quote)?.start ?? null) : null);

  // Read the decision history at the same version as the answer, including older stored views.
  const supersessions = stored?.version
    ? ((await prisma.handoverVersion.findUniqueOrThrow({ where: { id: stored.version.id }, select: { snapshot: true } })).snapshot as unknown as Snapshot).conflicts.filter(c => c.kind === "SUPERSEDES")
    : await prisma.conflict.findMany({ where: { projectId, kind: "SUPERSEDES" }, select: { claimAId: true, claimBId: true } });
  const claims: AskDoc[] = [];
  const citedBy = new Map<string, string>();
  for (const item of compiled?.sections.flatMap((s) => s.items) ?? []) {
    const ev = item.evidence;
    if (!ev.every((e) => visibleChunk(e.chunkId))) continue; // access changed since approval
    const supports = ev.filter((e) => e.relation === "SUPPORTS");
    const first = supports[0] ?? ev[0];
    const firstChunk = first ? chunkById.get(first.chunkId)! : null;
    for (const e of ev) if (!citedBy.has(e.chunkId)) citedBy.set(e.chunkId, item.id);
    claims.push({
      id: item.id,
      kind: "claim",
      title: item.title,
      text: [`${item.title}. ${item.statement}`, ...supports.map((e) => e.quote)].join("\n"),
      label: firstChunk ? label(firstChunk, first!.quote) : "handover",
      claimId: item.id,
      grade: item.grade,
      section: item.section,
      topicKey: (item as { topicKey?: string }).topicKey ?? item.title,
      chunkIds: ev.map((e) => e.chunkId),
      date: item.date,
      evidence: supports.map(e => ({ chunkId: e.chunkId, label: label(chunkById.get(e.chunkId)!, e.quote), quote: e.quote })),
      quotes: supports.map((e) => e.quote),
      fromTestimony: item.fromTestimony,
    });
  }

  const visibleClaims = new Map(claims.map(c => [c.id, c]));
  for (const edge of supersessions) {
    const earlier = visibleClaims.get(edge.claimAId);
    if (earlier && visibleClaims.has(edge.claimBId)) earlier.replacedBy = edge.claimBId;
  }
  const chunks: AskDoc[] = [];
  for (const [chunkId, claimId] of citedBy) {
    const c = visibleChunk(chunkId);
    if (c) chunks.push({ id: c.id, kind: "chunk", title: c.source.title, text: body(c), label: label(c), claimId });
  }

  // Testimony recorded after approval (follow-up answers): answerable before the next version.
  if (mode === "approved" && approvedAt) {
    const later = chunkRows.filter((c) => c.source.kind === "TESTIMONY" && c.source.createdAt > approvedAt && canSeeChunk(allowed, c) && !citedBy.has(c.id));
    if (later.length) {
      const ev = await prisma.evidence.findMany({ where: { chunkId: { in: later.map((c) => c.id) } }, select: { chunkId: true, claimId: true } });
      const claimOf = new Map(ev.map((e) => [e.chunkId, e.claimId]));
      for (const c of later) {
        const claimId = claimOf.get(c.id);
        if (claimId) chunks.push({ id: c.id, kind: "chunk", title: c.source.title, text: body(c), label: label(c), claimId, afterApproval: true });
      }
    }
  }

  // Strings this viewer must never receive: canaries in hidden excerpts and quotes of hidden facts.
  const asSnap = (c: (typeof liveClaims)[number]) =>
    ({ title: c.title, statement: c.statement, evidence: c.evidence.map((e) => ({ quote: e.quote })) }) as unknown as SnapshotClaim;
  const visible = liveClaims.filter((c) => canSeeClaim(allowed, c));
  const hidden = liveClaims.filter((c) => !canSeeClaim(allowed, c));
  const forbidden = forbiddenStrings(allowed, chunkRows, hidden.map(asSnap), [], visible.map(asSnap));

  return {
    mode,
    version: stored?.version?.number ?? null,
    approvedBy: stored?.version?.approvedBy ?? null,
    claims,
    chunks,
    forbidden,
    hiddenCount: compiled?.hiddenCount ?? 0,
    ...base,
  };
}
