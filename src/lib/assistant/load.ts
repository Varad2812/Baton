// DB side of the assistant context: loads the raw project data the pure builder filters.
import { allowedAccess, type Actor } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { resolveProject } from "@/lib/sandbox";
import { getRoleView, previewRoleView } from "@/lib/handover/service";
import { claimInclude } from "@/lib/views/claims";
import { citationLabel } from "@/lib/views/format";
import type { PageKey } from "./actions";
import { buildAssistantContext, type AssistantContext, type CtxClaim, type CtxPlan } from "./context";

export async function loadAssistantContext(opts: {
  actor: Actor;
  slug: string | null;
  page: PageKey;
  question: string;
}): Promise<AssistantContext & { projectId: string | null }> {
  const { actor, page, question } = opts;
  const project = opts.slug ? await resolveProject(opts.slug) : null;
  const allowedEmpty = { role: actor.role, levels: [], grantedSourceIds: [] };
  if (!project) {
    return {
      ...buildAssistantContext({
        page,
        question,
        viewer: actor,
        allowed: allowedEmpty,
        project: null,
        claims: [],
        conflicts: [],
        questions: [],
        chunks: [],
        handover: null,
        sources: 0,
        redactions: 0,
      }),
      projectId: null,
    };
  }
  const projectId = project.id;
  const wantsPlan = page === "handover" || /\bplan\b|7.day|30.day|first week|first month/i.test(question);
  const [allowed, claims, conflicts, questions, chunks, handover, sources, redactions] = await Promise.all([
    allowedAccess(actor.role, projectId),
    prisma.claim.findMany({ where: { projectId }, include: claimInclude, orderBy: [{ date: "desc" }, { id: "asc" }] }),
    prisma.conflict.findMany({ where: { projectId } }),
    prisma.gapQuestion.findMany({ where: { projectId } }),
    prisma.chunk.findMany({ where: { source: { projectId } }, select: { id: true, sourceId: true, access: true, text: true } }),
    prisma.handover.findFirst({
      where: { projectId },
      include: { from: { select: { name: true } }, to: { select: { name: true } }, reviewer: { select: { name: true } }, _count: { select: { versions: true } } },
    }),
    prisma.source.count({ where: { projectId } }),
    prisma.redaction.count({ where: { chunk: { source: { projectId } } } }),
  ]);

  let plan: CtxPlan | null = null;
  if (wantsPlan && handover) {
    try {
      const stored = await getRoleView(actor, projectId);
      const compiled = stored.view?.compiled ?? (await previewRoleView(actor, projectId)).view.compiled;
      plan = { plan7: compiled.plan7.map((p) => p.text), plan30: compiled.plan30.map((p) => p.text), approved: !!stored.view };
    } catch {
      plan = null;
    }
  }

  const ctxClaims: CtxClaim[] = claims.map((c) => ({
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
    date: c.date ? c.date.toISOString().slice(0, 10) : null,
    owner: c.owner?.name ?? null,
    // Every evidence row counts for visibility (same rule as loadClaims); only valid quotes are quoted.
    evidence: c.evidence.map((e) => ({
      quote: e.quoteValid ? e.quote : "",
      relation: e.relation,
      cite: citationLabel(e.chunk.source, e.chunk, e.matchStart),
      chunk: { access: e.chunk.access, sourceId: e.chunk.sourceId },
    })),
  }));

  const ctx = buildAssistantContext({
    page,
    question,
    viewer: actor,
    allowed,
    project: { name: project.name, description: project.description },
    claims: ctxClaims,
    conflicts,
    questions: questions.map((q) => ({
      id: q.id,
      kind: q.kind,
      question: q.question,
      rationale: q.rationale,
      priority: q.priority,
      answered: q.answer !== null,
      relatedClaimId: q.relatedClaimId,
    })),
    chunks,
    handover: handover
      ? { status: handover.status, versions: handover._count.versions, from: handover.from.name, to: handover.to.name, reviewer: handover.reviewer.name }
      : null,
    sources,
    redactions,
    plan,
  });
  return { ...ctx, projectId };
}
