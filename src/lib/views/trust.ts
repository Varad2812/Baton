// Trust report: quote validity, accuracy vs ground truth, canary leakage per role, redactions, runs, audit.
import type { Grade, Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { accessLevelsFor, allowedAccess, canSeeChunk, canSeeClaim, type Actor } from "@/lib/authz";
import groundTruth from "../../../seed/ground-truth.json";

type GtItem = { topicKey: string; expectClaim?: string; expectGrade?: string; statement?: string };

const ROLES: Role[] = ["OWNER", "REVIEWER", "INCOMING", "OBSERVER"];

export async function getTrust(projectId: string, actor: Actor) {
  const [claims, chunks, conflicts, redactions, runs, audit, evidence, viewerAllowed] = await Promise.all([
    prisma.claim.findMany({
      where: { projectId },
      select: {
        id: true,
        topicKey: true,
        grade: true,
        title: true,
        statement: true,
        access: true,
        evidence: { select: { chunk: { select: { access: true, sourceId: true } } } },
      },
    }),
    prisma.chunk.findMany({
      where: { source: { projectId } },
      select: { id: true, text: true, access: true, sourceId: true },
    }),
    prisma.conflict.findMany({ where: { projectId } }),
    prisma.redaction.findMany({
      where: { chunk: { source: { projectId } } },
      include: {
        chunk: {
          select: {
            locator: true,
            access: true,
            sourceId: true,
            timestamp: true,
            source: { select: { title: true, kind: true } },
          },
        },
      },
      orderBy: { id: "asc" },
    }),
    prisma.pipelineRun.findMany({ where: { projectId }, orderBy: { startedAt: "desc" }, take: 10 }),
    prisma.auditLog.findMany({ where: { projectId }, orderBy: { at: "desc" }, take: 60 }),
    prisma.evidence.findMany({
      where: { claim: { projectId } },
      select: { quoteValid: true, relation: true, chunk: { select: { source: { select: { kind: true } } } } },
    }),
    allowedAccess(actor.role, projectId),
  ]);

  /* Quote validity */
  const validByKind = new Map<string, { valid: number; total: number }>();
  for (const e of evidence) {
    const k = e.chunk.source.kind;
    const v = validByKind.get(k) ?? { valid: 0, total: 0 };
    v.total += 1;
    if (e.quoteValid) v.valid += 1;
    validByKind.set(k, v);
  }
  const quotesValid = evidence.filter((e) => e.quoteValid).length;
  const lastRun = runs[0];
  const validateStage = (lastRun?.stages as { stage: string; counts: Record<string, number> }[] | undefined)?.find(
    (s) => s.stage === "validate",
  );

  /* Accuracy vs ground truth (matched by topicKey, falling back to claim id) */
  const byTopic = new Map<string, typeof claims>();
  for (const c of claims) byTopic.set(c.topicKey, [...(byTopic.get(c.topicKey) ?? []), c]);
  const find = (g: GtItem) =>
    claims.find((c) => c.id === g.expectClaim) ??
    (byTopic.get(g.topicKey) ?? []).find((c) => !g.expectGrade || c.grade === g.expectGrade) ??
    byTopic.get(g.topicKey)?.[0];

  type Row = { label: string; expected: string; found: boolean; gradeOk: boolean; grade?: Grade; expectGrade?: string };
  const section = (name: string, items: GtItem[]) => {
    const rows: Row[] = items.map((g) => {
      const c = find(g);
      return {
        label: g.statement ?? g.topicKey,
        expected: g.topicKey,
        found: !!c,
        gradeOk: !!c && (!g.expectGrade || c.grade === g.expectGrade),
        grade: c?.grade,
        expectGrade: g.expectGrade,
      };
    });
    return { name, rows, found: rows.filter((r) => r.found).length, exact: rows.filter((r) => r.gradeOk).length };
  };
  const gt = groundTruth as unknown as {
    decisions: GtItem[];
    risks: GtItem[];
    gaps: (GtItem & { checklistKey: string })[];
    recurring: (GtItem & { phrase: string })[];
    conflicts: { topicKey: string; kind: string; a: string; b: string }[];
    supersessions: { topicKey: string; from: string; to: string; date: string }[];
    canaries: { value: string; sourceId: string; mustNotAppearFor: Role[] }[];
  };
  const conflictRows = [
    ...gt.conflicts.map((g) => ({ ...g, kindExpected: "CONTRADICTS" as const, from: g.a, to: g.b })),
    ...gt.supersessions.map((g) => ({ ...g, kindExpected: "SUPERSEDES" as const })),
  ].map((g) => {
    const hit = conflicts.find((c) => c.topicKey === g.topicKey);
    return {
      label: `${g.topicKey.replace(/_/g, " ")} (${g.kindExpected.toLowerCase()})`,
      expected: g.topicKey,
      found: !!hit,
      gradeOk: !!hit && hit.kind === g.kindExpected,
      grade: undefined,
      expectGrade: g.kindExpected,
    };
  });
  const accuracy = [
    section("Decisions", gt.decisions),
    section("Risks", gt.risks),
    section("Gaps (MISSING)", gt.gaps.map((g) => ({ ...g, expectGrade: g.expectClaim?.startsWith("clm_gap") ? "MISSING" : undefined }))),
    section("Recurring problems", gt.recurring.map((r) => ({ ...r, statement: `"${r.phrase}"` }))),
    {
      name: "Conflicts & evolution",
      rows: conflictRows,
      found: conflictRows.filter((r) => r.found).length,
      exact: conflictRows.filter((r) => r.gradeOk).length,
    },
  ];
  const accTotal = accuracy.reduce((s, a) => s + a.rows.length, 0);
  const accFound = accuracy.reduce((s, a) => s + a.found, 0);
  const accExact = accuracy.reduce((s, a) => s + a.exact, 0);

  /* Canary leakage per role: scan everything a role would be shown for canaries from chunks it may not see. */
  const canaryValues = new Set<string>(gt.canaries.map((c) => c.value));
  for (const ch of chunks) for (const m of ch.text.matchAll(/CANARY-[A-Z0-9-]+/g)) canaryValues.add(m[0]);
  const leakage = await Promise.all(
    ROLES.map(async (role) => {
      const allowed = await allowedAccess(role, projectId);
      const hiddenChunks = chunks.filter((c) => !canSeeChunk(allowed, c));
      const canaries = [...canaryValues].filter((v) => hiddenChunks.some((c) => c.text.includes(v)));
      const shownClaims = claims.filter((c) => canSeeClaim(allowed, c));
      const shownChunks = chunks.filter((c) => canSeeChunk(allowed, c));
      const corpus = [
        ...shownClaims.map((c) => `${c.title}\n${c.statement}`),
        ...shownChunks.map((c) => c.text),
      ].join("\n");
      const leaks = canaries.filter((v) => corpus.includes(v)).length;
      return {
        role,
        levels: accessLevelsFor(role),
        granted: allowed.grantedSourceIds.length,
        claimsShown: shownClaims.length,
        claimsHidden: claims.length - shownClaims.length,
        chunksHidden: hiddenChunks.length,
        canariesTested: canaries.length,
        leaks,
      };
    }),
  );

  return {
    quotes: {
      valid: quotesValid,
      total: evidence.length,
      contradicts: evidence.filter((e) => e.relation === "CONTRADICTS").length,
      dropped: validateStage?.counts.dropped ?? 0,
      discarded: validateStage?.counts.claimsDiscarded ?? 0,
      byKind: [...validByKind.entries()].sort((a, b) => b[1].total - a[1].total),
    },
    accuracy,
    accTotals: { total: accTotal, found: accFound, exact: accExact },
    leakage,
    canaries: [...canaryValues],
    redactions: redactions.map((r) => {
      const visible = canSeeChunk(viewerAllowed, r.chunk);
      return {
        id: r.id,
        kind: r.kind,
        placeholder: r.placeholder,
        mentionedBy: r.mentionedBy,
        source: visible ? r.chunk.source.title : "Restricted source",
        locator: visible ? r.chunk.locator : "—",
        access: r.chunk.access,
        at: r.chunk.timestamp,
      };
    }),
    runs: runs.map((r) => ({
      id: r.id,
      mode: r.mode,
      status: r.status,
      model: r.model,
      startedAt: r.startedAt,
      ms: r.finishedAt ? r.finishedAt.getTime() - r.startedAt.getTime() : null,
      stages: (r.stages as { stage: string; status: string; ms: number; counts: Record<string, number> }[]) ?? [],
      error: r.error,
    })),
    audit,
  };
}

export type TrustData = Awaited<ReturnType<typeof getTrust>>;
