// Everything the command-centre dashboard needs, computed from the DB for the current persona.
import type { Grade, SourceKind, Access } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import type { Actor } from "@/lib/authz";
import { canSeeChunk } from "@/lib/authz";
import { loadClaims, type ClaimFull } from "@/lib/views/claims";
import { checklistScore, evaluateChecklist } from "@/lib/views/checklist";
import { GRADE_ORDER, pct } from "@/lib/views/format";

/* ------------------------------------------------------------------------- */
/* Bus factor from commit history                                             */
/* ------------------------------------------------------------------------- */

export type AreaOwnership = {
  area: string;
  commits: number;
  top: { name: string; commits: number; share: number };
  others: { name: string; commits: number }[];
  lastCommit: string;
  busFactor: number;
};

const COMMIT_HEAD = /^([0-9a-f]{7}) · (\d{4}-\d{2}-\d{2}) · (.+?) \(@[^)]+\)$/;

function areaOf(path: string): string {
  const parts = path.trim().split("/");
  if ((parts[0] === "apps" || parts[0] === "services") && parts[1]) return `${parts[0]}/${parts[1]}`;
  return "repo root";
}

/** Parses "hash · date · Name (@handle)\nmessage\nfiles: a, b" blocks out of commit chunks. */
export function busFactorFromCommits(texts: string[]): AreaOwnership[] {
  const byArea = new Map<string, { authors: Map<string, number>; last: string; total: number }>();
  for (const text of texts) {
    const lines = text.split("\n");
    let author: string | null = null;
    let date = "";
    for (const line of lines) {
      const head = line.match(COMMIT_HEAD);
      if (head) {
        author = head[3];
        date = head[2];
        continue;
      }
      if (author && line.startsWith("files: ")) {
        const areas = new Set(line.slice(7).split(",").map(areaOf));
        // Repo-wide commits (scaffolding, formatting) say nothing about who knows an area.
        if (areas.size >= 3) {
          author = null;
          continue;
        }
        for (const a of areas) {
          const e = byArea.get(a) ?? { authors: new Map(), last: "", total: 0 };
          e.authors.set(author, (e.authors.get(author) ?? 0) + 1);
          e.total += 1;
          if (date > e.last) e.last = date;
          byArea.set(a, e);
        }
        author = null;
      }
    }
  }
  return [...byArea.entries()]
    .filter(([area]) => area !== "repo root")
    .map(([area, e]) => {
      const sorted = [...e.authors.entries()].sort((a, b) => b[1] - a[1]);
      // Bus factor: smallest number of people covering >50% of commits.
      let acc = 0;
      let bf = 0;
      for (const [, n] of sorted) {
        acc += n;
        bf += 1;
        if (acc / e.total > 0.5) break;
      }
      return {
        area,
        commits: e.total,
        top: { name: sorted[0][0], commits: sorted[0][1], share: sorted[0][1] / e.total },
        others: sorted.slice(1).map(([name, commits]) => ({ name, commits })),
        lastCommit: e.last,
        busFactor: sorted.length === 1 ? 1 : bf,
      };
    })
    .sort((a, b) => b.top.share - a.top.share || b.commits - a.commits);
}

/* ------------------------------------------------------------------------- */
/* Timeline                                                                   */
/* ------------------------------------------------------------------------- */

export type TimelineEntry = {
  id: string;
  date: Date;
  kind: "supersedes" | "conflict" | "decision";
  title: string;
  fromTitle?: string;
  fromDate?: Date | null;
  claimId: string;
  grade: Grade;
  reason: string;
};

function buildTimeline(
  visible: ClaimFull[],
  conflicts: { kind: string; status: string; claimAId: string; claimBId: string; topicKey: string; note: string | null }[],
): TimelineEntry[] {
  const byId = new Map(visible.map((c) => [c.id, c]));
  const used = new Set<string>();
  const out: TimelineEntry[] = [];
  for (const cf of conflicts) {
    const a = byId.get(cf.claimAId);
    const b = byId.get(cf.claimBId);
    if (!a || !b || !b.date) continue;
    used.add(a.id);
    used.add(b.id);
    if (cf.kind === "SUPERSEDES") {
      out.push({
        id: `sup-${cf.topicKey}`,
        date: b.date,
        kind: "supersedes",
        title: b.title,
        fromTitle: a.title,
        fromDate: a.date,
        claimId: b.id,
        grade: b.grade,
        reason: b.gradeReason,
      });
    } else if (cf.status === "OPEN") {
      out.push({
        id: `cf-${cf.topicKey}`,
        date: b.date,
        kind: "conflict",
        title: b.title,
        fromTitle: a.title,
        fromDate: a.date,
        claimId: b.id,
        grade: "CONFLICTING",
        reason: cf.note ?? "",
      });
    }
  }
  for (const c of visible) {
    if (c.type !== "DECISION" || used.has(c.id) || !c.date || c.grade === "MISSING") continue;
    if (c.fromTestimony) continue;
    out.push({
      id: c.id,
      date: c.date,
      kind: "decision",
      title: c.title,
      claimId: c.id,
      grade: c.grade,
      reason: c.gradeReason,
    });
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/* ------------------------------------------------------------------------- */
/* Dashboard                                                                  */
/* ------------------------------------------------------------------------- */

export type AttentionItem = {
  id: string;
  kind: "conflict" | "missing" | "inferred" | "gap" | "risk";
  title: string;
  detail: string;
  href: string;
  action: string;
  grade: Grade;
};

function weekIndex(d: Date, start: Date): number {
  return Math.floor((d.getTime() - start.getTime()) / (7 * 86400_000));
}

export async function getDashboard(projectId: string, slug: string, actor: Actor) {
  const [claimsRes, conflicts, gaps, sources, chunks, audit, run, handover] = await Promise.all([
    loadClaims(projectId, actor),
    prisma.conflict.findMany({ where: { projectId } }),
    prisma.gapQuestion.findMany({ where: { projectId }, orderBy: { priority: "desc" } }),
    prisma.source.findMany({
      where: { projectId },
      select: { id: true, kind: true, access: true, title: true, _count: { select: { chunks: true } } },
    }),
    prisma.chunk.findMany({
      where: { source: { projectId } },
      select: { id: true, timestamp: true, access: true, sourceId: true, text: true, source: { select: { kind: true } } },
    }),
    prisma.auditLog.findMany({ where: { projectId }, orderBy: { at: "desc" }, take: 8 }),
    prisma.pipelineRun.findFirst({ where: { projectId }, orderBy: { startedAt: "desc" } }),
    prisma.handover.findFirst({ where: { projectId }, include: { _count: { select: { versions: true } } } }),
  ]);
  const { visible, hiddenCount, allowed } = claimsRes;
  const visibleIds = new Set(visible.map((c) => c.id));
  const active = visible.filter((c) => c.status !== "REJECTED");

  // Grades
  const grades = Object.fromEntries(GRADE_ORDER.map((g) => [g, 0])) as Record<Grade, number>;
  for (const c of active) grades[c.grade] += 1;
  const total = active.length;

  // Conflicts and gaps (only those whose claims the viewer can see)
  const contradicts = conflicts.filter(
    (c) => c.kind === "CONTRADICTS" && visibleIds.has(c.claimAId) && visibleIds.has(c.claimBId),
  );
  const openConflicts = contradicts.filter((c) => c.status === "OPEN");
  const visibleGaps = gaps.filter((g) => !g.relatedClaimId || visibleIds.has(g.relatedClaimId));
  const openGaps = visibleGaps.filter((g) => !g.answer);

  // Readiness
  const checklist = evaluateChecklist(active, visibleGaps);
  const parts = {
    verified: total ? grades.VERIFIED / total : 0,
    conflicts: contradicts.length ? 1 - openConflicts.length / contradicts.length : 1,
    checklist: checklistScore(checklist),
    gaps: visibleGaps.length ? 1 - openGaps.length / visibleGaps.length : 1,
  };
  const readiness = Math.round(
    100 * (0.4 * parts.verified + 0.2 * parts.conflicts + 0.25 * parts.checklist + 0.15 * parts.gaps),
  );

  // Weekly activity sparkline (records per week, visible chunks only), Jan 5 → last chunk
  const visibleChunks = chunks.filter((c) => canSeeChunk(allowed, c));
  const start = new Date("2026-01-05T00:00:00+05:30");
  const weeks = 16;
  const activity = Array.from({ length: weeks }, () => 0);
  for (const ch of visibleChunks) {
    if (!ch.timestamp) continue;
    const w = weekIndex(ch.timestamp, start);
    if (w >= 0 && w < weeks) activity[w] += 1;
  }
  const claimsByWeek = Array.from({ length: weeks }, () => 0);
  for (const c of active) {
    if (!c.date) continue;
    const w = weekIndex(c.date, start);
    if (w >= 0 && w < weeks) claimsByWeek[w] += 1;
  }
  const cumulative = claimsByWeek.reduce<number[]>((acc, n) => [...acc, (acc.at(-1) ?? 0) + n], []);

  // Bus factor
  const commitTexts = chunks.filter((c) => c.source.kind === "GITHUB_COMMIT").map((c) => c.text);
  const ownership = busFactorFromCommits(commitTexts);

  // Needs attention
  const byId = new Map(visible.map((c) => [c.id, c]));
  const attention: AttentionItem[] = [];
  for (const cf of openConflicts) {
    const a = byId.get(cf.claimAId)!;
    const b = byId.get(cf.claimBId)!;
    attention.push({
      id: cf.id,
      kind: "conflict",
      title: `${a.title.replace(/ \(.*\)$/, "")} vs ${b.title.replace(/ \(.*\)$/, "")}`,
      detail: cf.note ?? "Two sources disagree.",
      href: `/p/${slug}/conflicts#${cf.id}`,
      action: "Resolve",
      grade: "CONFLICTING",
    });
  }
  for (const c of active.filter((c) => c.grade === "MISSING")) {
    const gap = openGaps.find((g) => g.relatedClaimId === c.id);
    attention.push({
      id: c.id,
      kind: "missing",
      title: c.title,
      detail: c.gradeReason,
      href: gap ? `/p/${slug}/interview#${gap.id}` : `/p/${slug}/ledger?claim=${c.id}`,
      action: gap ? "Ask Meera" : "Open",
      grade: "MISSING",
    });
  }
  for (const c of active.filter((c) => c.grade === "INFERRED" && c.type === "RISK")) {
    attention.push({
      id: c.id,
      kind: "inferred",
      title: c.title,
      detail: c.gradeReason,
      href: `/p/${slug}/ledger?claim=${c.id}`,
      action: "Confirm",
      grade: "INFERRED",
    });
  }
  const order = { conflict: 0, missing: 1, risk: 2, inferred: 3, gap: 4 };
  attention.sort((a, b) => order[a.kind] - order[b.kind]);

  // Sources summary
  const byKind = new Map<SourceKind, { sources: number; chunks: number }>();
  const byAccess = new Map<Access, number>();
  for (const s of sources) {
    const e = byKind.get(s.kind) ?? { sources: 0, chunks: 0 };
    e.sources += 1;
    e.chunks += s._count.chunks;
    byKind.set(s.kind, e);
    byAccess.set(s.access, (byAccess.get(s.access) ?? 0) + 1);
  }

  const asOf =
    chunks
      .filter((c) => c.source.kind !== "TESTIMONY" && c.timestamp)
      .reduce<Date | null>((m, c) => (!m || c.timestamp! > m ? c.timestamp! : m), null) ?? new Date();
  const firstRecord =
    chunks.filter((c) => c.timestamp).reduce<Date | null>((m, c) => (!m || c.timestamp! < m ? c.timestamp! : m), null) ?? asOf;

  return {
    asOf,
    firstRecord,
    total,
    hiddenCount,
    rejected: visible.length - active.length,
    singleOwnerGap: visibleGaps.find((g) => g.kind === "SINGLE_OWNER" && !g.answer) ?? null,
    grades,
    verifiedPct: pct(grades.VERIFIED, total),
    openConflicts: openConflicts.length,
    totalConflicts: contradicts.length,
    openGaps: openGaps.length,
    totalGaps: visibleGaps.length,
    highPriorityGaps: openGaps.filter((g) => g.priority >= 30).length,
    readiness,
    readinessParts: parts,
    checklist,
    activity,
    cumulative,
    ownership,
    timeline: buildTimeline(visible, conflicts),
    attention,
    sources: {
      total: sources.length,
      chunks: chunks.length,
      byKind: [...byKind.entries()].sort((a, b) => b[1].chunks - a[1].chunks),
      byAccess: (["PUBLIC", "TEAM", "RESTRICTED"] as Access[]).map((a) => [a, byAccess.get(a) ?? 0] as const),
    },
    audit,
    run,
    versions: handover?._count.versions ?? 0,
    constellation: active.map((c) => ({
      id: c.id,
      grade: c.grade,
      type: c.type,
      sources: [...new Set(c.evidence.map((e) => e.chunk.source.kind))],
    })),
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboard>>;
