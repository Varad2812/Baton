// Role-compiled handover view. Until the pipeline branch writes RoleViews on approval, this compiles a
// deterministic draft from ONLY the claims the viewer may see (same rule as compileRoleView).
import { prisma } from "@/lib/db";
import type { Actor } from "@/lib/authz";
import { loadClaims, type ClaimFull } from "@/lib/views/claims";
import { citationLabel, fmtDate } from "@/lib/views/format";

export const SECTION_ORDER = [
  "Purpose & status",
  "Run & deploy",
  "Code & docs",
  "Access & secrets",
  "Open work",
  "Decisions",
  "Vendors & dependencies",
  "Contacts",
  "Recurring problems",
  "Deadlines",
  "Review & approval",
  "Risks",
];

export type Citation = { label: string; chunkId: string; quote: string };

export type PlanItem = {
  id: string;
  title: string;
  why: string;
  due: Date | null;
  claimId: string;
  kind: "conflict" | "risk" | "task" | "missing" | "inferred" | "recurring";
  citations: Citation[];
};

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

export async function getHandoverView(projectId: string, actor: Actor) {
  const [claimsRes, handover, conflicts, gaps, latestChunk] = await Promise.all([
    loadClaims(projectId, actor),
    prisma.handover.findFirst({
      where: { projectId },
      include: {
        from: true,
        to: true,
        reviewer: true,
        versions: {
          orderBy: { number: "desc" },
          include: {
            approvedBy: { select: { name: true } },
            acknowledgements: { include: { person: { select: { name: true } } } },
            roleViews: { select: { role: true, hiddenCount: true, sourceChunkIds: true } },
          },
        },
        followUps: {
          orderBy: { createdAt: "desc" },
          include: { askedBy: { select: { name: true } }, claim: { select: { id: true, title: true } } },
        },
      },
    }),
    prisma.conflict.findMany({ where: { projectId, kind: "CONTRADICTS", status: "OPEN" } }),
    prisma.gapQuestion.findMany({ where: { projectId } }),
    prisma.chunk.findFirst({
      where: { source: { projectId } },
      orderBy: { timestamp: "desc" },
      select: { timestamp: true },
    }),
  ]);

  const { visible, hiddenCount, hiddenBySection } = claimsRes;
  const active = visible.filter((c) => c.status !== "REJECTED");
  const byId = new Map(active.map((c) => [c.id, c]));
  const asOf = latestChunk?.timestamp ?? new Date();
  const horizon7 = new Date(asOf.getTime() + 7 * 86400_000);

  /* Sections */
  const sectionNames = [
    ...SECTION_ORDER.filter((s) => active.some((c) => c.section === s) || hiddenBySection[s]),
    ...[...new Set(active.map((c) => c.section))].filter((s) => !SECTION_ORDER.includes(s)),
  ];
  const sections = sectionNames.map((name) => {
    const claims = active
      .filter((c) => c.section === name)
      .sort((a, b) => gradeRank(a) - gradeRank(b) || (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));
    return {
      name,
      hidden: hiddenBySection[name] ?? 0,
      claims: claims.map((c) => ({
        id: c.id,
        title: c.title,
        statement: c.statement,
        grade: c.grade,
        type: c.type,
        date: c.date,
        owner: c.owner?.name ?? null,
        fromTestimony: c.fromTestimony,
        citations: citationsFor(c),
      })),
    };
  });

  /* Plan */
  const plan7: PlanItem[] = [];
  const plan30: PlanItem[] = [];
  const push = (item: PlanItem, urgent: boolean) => (urgent ? plan7 : plan30).push(item);

  for (const cf of conflicts) {
    const a = byId.get(cf.claimAId);
    const b = byId.get(cf.claimBId);
    if (!a || !b) continue;
    push(
      {
        id: `p-${cf.id}`,
        title: `Settle: ${cf.topicKey.replace(/_/g, " ")}`,
        why: `${a.title} vs ${b.title}. ${cf.note ?? ""}`.trim(),
        due: null,
        claimId: b.id,
        kind: "conflict",
        citations: [...citationsFor(a).slice(0, 1), ...citationsFor(b).slice(0, 1)],
      },
      true,
    );
  }
  for (const c of active) {
    if (c.grade === "MISSING") {
      const gap = gaps.find((g) => g.relatedClaimId === c.id);
      push(
        {
          id: `p-${c.id}`,
          title: gap?.answer ? `Act on Meera's answer: ${c.title}` : (gap?.question ?? c.title),
          why: c.gradeReason,
          due: null,
          claimId: c.id,
          kind: "missing",
          citations: [],
        },
        true,
      );
      continue;
    }
    if (c.type === "TASK" && c.status !== "APPROVED") {
      const urgent = !c.date || c.date <= horizon7;
      push(
        {
          id: `p-${c.id}`,
          title: c.title,
          why: c.owner ? `Owner: ${c.owner.name}. ${c.statement}` : `Unassigned. ${c.statement}`,
          due: c.date,
          claimId: c.id,
          kind: "task",
          citations: citationsFor(c),
        },
        urgent,
      );
      continue;
    }
    if (c.type === "RISK") {
      const urgent = c.grade === "VERIFIED" && (!c.date || c.date <= horizon7);
      push(
        {
          id: `p-${c.id}`,
          title: c.grade === "INFERRED" ? `Confirm: ${lower(c.title)}` : `Mitigate: ${lower(c.title)}`,
          why: c.statement,
          due: c.date && c.date > asOf ? c.date : null,
          claimId: c.id,
          kind: c.grade === "INFERRED" ? "inferred" : "risk",
          citations: citationsFor(c),
        },
        urgent,
      );
      continue;
    }
    if (c.type === "RECURRING" && c.fromTestimony) {
      push(
        {
          id: `p-${c.id}`,
          title: c.title,
          why: c.statement,
          due: null,
          claimId: c.id,
          kind: "recurring",
          citations: citationsFor(c),
        },
        false,
      );
    }
  }
  const order = { conflict: 0, missing: 1, risk: 2, task: 3, inferred: 4, recurring: 5 };
  const sortPlan = (xs: PlanItem[]) =>
    xs.sort(
      (a, b) =>
        order[a.kind] - order[b.kind] || (a.due?.getTime() ?? Infinity) - (b.due?.getTime() ?? Infinity),
    );

  const purpose = active.find((c) => c.section === "Purpose & status");
  const counts = {
    verified: active.filter((c) => c.grade === "VERIFIED").length,
    risks: active.filter((c) => c.type === "RISK" && c.grade !== "MISSING").length,
    missing: active.filter((c) => c.grade === "MISSING").length,
    conflicts: plan7.filter((p) => p.kind === "conflict").length,
  };
  const overview = [
    purpose?.statement ?? `${active.length} claims are visible at your access level.`,
    `${counts.verified} of ${active.length} facts are verified by two independent sources or an authoritative record.`,
    counts.conflicts > 0
      ? `${counts.conflicts} decisions still disagree across sources and must be settled before the fest.`
      : "No open contradictions at your access level.",
    counts.missing > 0
      ? `${counts.missing} handover items have no record at all; they are listed in the first-week plan.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  const latest = handover?.versions[0] ?? null;
  const acknowledged = new Set(
    (latest?.acknowledgements ?? []).filter((a) => a.personId === handover?.toPersonId).map((a) => a.section),
  );

  return {
    asOf,
    asOfLabel: fmtDate(asOf),
    handover: handover
      ? {
          id: handover.id,
          status: handover.status,
          currentVersion: handover.currentVersion,
          from: handover.from,
          to: handover.to,
          reviewer: handover.reviewer,
        }
      : null,
    latestVersion: latest
      ? {
          number: latest.number,
          approvedBy: latest.approvedBy?.name ?? null,
          approvedAt: latest.approvedAt,
          note: latest.note,
          acknowledgements: latest.acknowledgements.map((a) => ({ section: a.section, by: a.person.name, at: a.at })),
        }
      : null,
    versions: (handover?.versions ?? []).map((v) => ({
      number: v.number,
      approvedBy: v.approvedBy?.name ?? null,
      approvedAt: v.approvedAt,
      note: v.note,
      acks: v.acknowledgements.length,
    })),
    acknowledged: [...acknowledged],
    followUps: (handover?.followUps ?? [])
      .filter((f) => !f.claimId || byId.has(f.claimId))
      .map((f) => ({
        id: f.id,
        question: f.question,
        section: f.section,
        claim: f.claim,
        askedBy: f.askedBy.name,
        answer: f.answer,
        answeredAt: f.answeredAt,
        createdAt: f.createdAt,
      })),
    hiddenCount,
    overview,
    counts,
    sections,
    plan7: sortPlan(plan7),
    plan30: sortPlan(plan30),
    sourceChunkIds: [...new Set(active.flatMap((c) => c.evidence.map((e) => e.chunkId)))],
  };
}

function gradeRank(c: ClaimFull): number {
  return ["CONFLICTING", "MISSING", "VERIFIED", "SINGLE_SOURCE", "INFERRED"].indexOf(c.grade);
}

function lower(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

export type HandoverViewData = Awaited<ReturnType<typeof getHandoverView>>;
