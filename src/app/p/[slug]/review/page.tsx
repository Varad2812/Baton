import Link from "next/link";
import { Check, CircleDashed, GitCompareArrows, History, Lock, Minus, TriangleAlert } from "lucide-react";
import { can, getActor, projectPersonas } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { getProject } from "@/lib/views/project";
import { loadClaims } from "@/lib/views/claims";
import { evaluateChecklist } from "@/lib/views/checklist";
import { SECTIONS } from "@/lib/pipeline/checklist";
import { approvalState, reviewedSections, versionDiff } from "@/lib/handover/service";
import { diffIsEmpty } from "@/lib/handover/diff";
import { fmtDate, fmtDateTime, GRADE_LABEL, GRADE_ORDER, TYPE_LABEL } from "@/lib/views/format";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GradeChip } from "@/components/ui/grade-chip";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { GradeBar } from "@/components/common/grade-bar";
import { ApprovePanel } from "@/components/review/approve-panel";
import { ReviewClaimRow } from "@/components/review/review-claim-row";
import { SectionReviewed } from "@/components/review/section-reviewed";

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const [project, actor] = await Promise.all([getProject(slug), getActor(slug)]);
  const [{ visible, hiddenCount }, handover, conflicts, gaps, evidence, lastEdit, gate, reviewed] = await Promise.all([
    loadClaims(project.id, actor),
    prisma.handover.findFirst({
      where: { projectId: project.id },
      include: {
        from: true,
        to: true,
        reviewer: true,
        versions: { orderBy: { number: "desc" }, include: { approvedBy: { select: { name: true } } } },
      },
    }),
    prisma.conflict.findMany({ where: { projectId: project.id, kind: "CONTRADICTS" } }),
    prisma.gapQuestion.findMany({ where: { projectId: project.id } }),
    prisma.evidence.groupBy({ by: ["quoteValid"], where: { claim: { projectId: project.id } }, _count: true }),
    prisma.auditLog.findFirst({
      where: { projectId: project.id, action: { startsWith: "claim." } },
      orderBy: { at: "desc" },
    }),
    approvalState(project.id),
    reviewedSections(project.id),
  ]);
  const active = visible.filter((c) => c.status !== "REJECTED");
  const checklist = evaluateChecklist(active, gaps);
  const openConflicts = conflicts.filter((c) => c.status === "OPEN").length;
  const openGaps = gaps.filter((g) => !g.answer).length;
  const validQ = evidence.find((e) => e.quoteValid)?._count ?? 0;
  const totalQ = evidence.reduce((s, e) => s + e._count, 0);
  const edited = visible.filter((c) => c.status === "EDITED").length;
  const rejected = visible.filter((c) => c.status === "REJECTED").length;
  const nextVersion = (handover?.currentVersion ?? 0) + 1;
  const canEdit = can(actor.role, "edit_claims");

  const sections = [
    ...SECTIONS.filter((s) => visible.some((c) => c.section === s)),
    ...[...new Set(visible.map((c) => c.section))].filter((s) => !(SECTIONS as readonly string[]).includes(s)),
  ];
  const reviewedCount = sections.filter((s) => reviewed.has(s)).length;
  // Blockers come from the same gate approveVersion enforces on the server.
  const blockers = gate.blockers.map((b) => b.label);
  const advisories = [
    { label: "All quotes string-matched", ok: validQ === totalQ, detail: `${validQ}/${totalQ}` },
    {
      label: "Checklist covered",
      ok: checklist.every((r) => r.state === "covered"),
      detail: `${checklist.filter((r) => r.state === "covered").length}/12`,
    },
    { label: "Gap questions answered", ok: openGaps === 0, detail: `${gaps.length - openGaps}/${gaps.length}` },
    { label: "Sections marked reviewed", ok: reviewedCount === sections.length, detail: `${reviewedCount}/${sections.length}` },
  ];
  const gateRows = [
    { label: "No open contradictions", ok: openConflicts === 0, detail: `${openConflicts} open`, blocking: true },
    {
      label: "P1 gap questions answered",
      ok: !gate.blockers.some((b) => b.kind === "p1_gap"),
      detail: `${gate.blockers.filter((b) => b.kind === "p1_gap").length} open`,
      blocking: true,
    },
    ...advisories.map((a) => ({ ...a, blocking: false })),
  ];

  // Version diff (?diff=draft or ?diff=1..2), at the viewer's access level.
  const versions = handover?.versions ?? [];
  const latest = versions[0]?.number ?? 0;
  const diffParam = typeof sp.diff === "string" ? sp.diff : undefined;
  let diff: Awaited<ReturnType<typeof versionDiff>> | null = null;
  if (diffParam && latest) {
    const m = diffParam.match(/^(\d+)\.\.(\d+|draft)$/);
    const from = m ? Number(m[1]) : latest;
    const to = m ? (m[2] === "draft" ? "draft" : Number(m[2])) : "draft";
    diff = await versionDiff(actor, project.id, from, to).catch(() => null);
  }
  const disabledReason =
    actor.role === "OWNER"
      ? "No self-approval: the departing owner cannot approve their own handover"
      : !can(actor.role, "approve_version")
        ? `Only the reviewer (${(await projectPersonas(slug)).rao.name}) can approve a version`
        : null;

  return (
    <>
      <PageHeader
        title="Review & approve"
        description="A reviewer checks each section, then approves. Approval freezes one version and builds each person's safe view."
        tryThis={{ text: can(actor.role, "approve_version") ? "Approve as the reviewer. Open conflicts need an override note." : "Only the reviewer approves. Use Start here, step 4, to switch to them.", selector: '[data-tour="approve"]' }}
        meta={
          handover && (
            <>
              <span className="inline-flex items-center gap-1.5">
                <Avatar name={handover.from.name} size={16} /> {handover.from.name}
              </span>
              <span>→</span>
              <span className="inline-flex items-center gap-1.5">
                <Avatar name={handover.to.name} size={16} /> {handover.to.name}
              </span>
              <span className="text-border">·</span>
              <span className="inline-flex items-center gap-1.5">
                Reviewer <Avatar name={handover.reviewer.name} size={16} /> {handover.reviewer.name}
              </span>
              <span className="text-border">·</span>
              <Badge variant="primary" size="sm">
                {handover.status.replace("_", " ").toLowerCase()}
              </Badge>
            </>
          )
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
          {diff && (
            <Card id="diff" className="scroll-mt-28">
              <CardHeader
                icon={<GitCompareArrows />}
                title={`v${diff.from} → ${diff.to === "draft" ? "current draft" : `v${diff.to}`}`}
                description={`${diff.diff.added.length} added · ${diff.diff.removed.length} removed or rejected · ${diff.diff.changed.length} changed · ${diff.diff.unchanged} unchanged${diff.hidden ? ` · ${diff.hidden} hidden at your access level` : ""}`}
                actions={
                  <Link href="?" scroll={false} className="text-xs text-muted hover:text-text">
                    Close
                  </Link>
                }
              />
              {diffIsEmpty(diff.diff) ? (
                <p className="px-4 py-3 text-[13px] text-muted">No changes at your access level.</p>
              ) : (
                <ul className="divide-y divide-border/70 text-[13px]">
                  {diff.diff.conflicts.map((c) => (
                    <li key={c.id} className="flex items-center gap-2 px-4 py-2">
                      <Badge variant="outline" size="sm">conflict</Badge>
                      <span className="capitalize text-text">{c.topicKey.replace(/_/g, " ")}</span>
                      <span className="font-mono text-[11px] text-subtle">
                        {c.from.toLowerCase()} → {c.to.toLowerCase()}
                        {c.resolution ? ` (${c.resolution})` : ""}
                      </span>
                    </li>
                  ))}
                  {diff.diff.answered.map((q) => (
                    <li key={q.id} className="flex items-center gap-2 px-4 py-2">
                      <Badge variant="testimony" size="sm">answered</Badge>
                      <span className="truncate text-text">{q.question}</span>
                    </li>
                  ))}
                  {diff.diff.added.map((c) => (
                    <li key={c.id} className="flex items-center gap-2 px-4 py-2">
                      <Badge variant="success" size="sm">added</Badge>
                      <GradeChip grade={c.grade} compact />
                      <span className="truncate text-text">{c.title}</span>
                      <span className="ml-auto text-xs text-subtle">{c.section}</span>
                    </li>
                  ))}
                  {diff.diff.removed.map((c) => (
                    <li key={c.id} className="flex items-center gap-2 px-4 py-2">
                      <Badge variant="danger" size="sm">removed</Badge>
                      <span className="truncate text-muted line-through">{c.title}</span>
                      <span className="ml-auto text-xs text-subtle">{c.section}</span>
                    </li>
                  ))}
                  {diff.diff.changed.map((ch) => (
                    <li key={ch.claim.id} className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="info" size="sm">changed</Badge>
                        <Link href={`/p/${slug}/ledger?claim=${ch.claim.id}`} className="truncate text-text hover:underline">
                          {ch.claim.title}
                        </Link>
                      </div>
                      <ul className="mt-1 space-y-0.5 pl-1 text-xs text-muted">
                        {ch.changes.map((f) => (
                          <li key={f.field} className="grid grid-cols-[64px_minmax(0,1fr)] gap-2">
                            <span className="font-mono text-subtle">{f.field}</span>
                            <span className="min-w-0 truncate">
                              {f.field === "grade" ? (
                                `${GRADE_LABEL[f.from as keyof typeof GRADE_LABEL] ?? f.from} → ${GRADE_LABEL[f.to as keyof typeof GRADE_LABEL] ?? f.to}`
                              ) : (
                                <>
                                  <span className="text-subtle line-through">{f.from}</span> → <span className="text-text">{f.to}</span>
                                </>
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
              {diff.approval?.override && (
                <p className="border-t border-border px-4 py-2 text-xs text-conflicting">
                  Approved with override by {diff.approval.by}: {diff.approval.note}
                </p>
              )}
            </Card>
          )}
          {sections.map((s) => {
            const items = visible
              .filter((c) => c.section === s)
              .sort((a, b) => GRADE_ORDER.indexOf(a.grade) - GRADE_ORDER.indexOf(b.grade));
            const grades = Object.fromEntries(GRADE_ORDER.map((g) => [g, items.filter((c) => c.grade === g && c.status !== "REJECTED").length])) as Record<
              (typeof GRADE_ORDER)[number],
              number
            >;
            return (
              <Card key={s} id={s.replace(/\W+/g, "-").toLowerCase()} className="scroll-mt-28">
                <CardHeader
                  title={
                    <span className="flex items-center gap-2">
                      {s} <span className="font-mono text-[11px] font-normal text-subtle">{items.length}</span>
                    </span>
                  }
                  actions={
                    <>
                      <GradeBar grades={grades} className="w-32" />
                      <SectionReviewed
                        slug={slug}
                        section={s}
                        canEdit={canEdit}
                        reviewed={reviewed.has(s) ? { by: reviewed.get(s)!.by, at: reviewed.get(s)!.at.toISOString() } : null}
                      />
                    </>
                  }
                />
                <ul className="divide-y divide-border/70">
                  {items.map((c) => (
                    <ReviewClaimRow
                      key={c.id}
                      slug={slug}
                      canEdit={canEdit}
                      c={{
                        id: c.id,
                        title: c.title,
                        statement: c.statement,
                        grade: c.grade,
                        typeLabel: TYPE_LABEL[c.type],
                        status: c.status,
                        fromTestimony: c.fromTestimony,
                        reviewerNote: c.reviewerNote,
                        section: c.section,
                      }}
                    />
                  ))}
                </ul>
              </Card>
            );
          })}
          {hiddenCount > 0 && (
            <p className="flex items-center gap-2 rounded-lg border border-dashed border-border px-4 py-3 text-[13px] text-muted">
              <Lock className="size-4 text-subtle" /> {hiddenCount} fact{hiddenCount === 1 ? "" : "s"} hidden at your access
              level are not shown for review.
            </p>
          )}
        </div>

        <aside className="space-y-4">
          <Card className="sticky top-28">
            <CardHeader title="Approval" description={`Draft for v${nextVersion}`} />
            <ul className="space-y-2 px-4 py-3">
              {gateRows.map((g) => (
                <li key={g.label} className="flex items-center gap-2 text-[13px]">
                  {g.ok ? (
                    <Check className="size-3.5 text-verified" />
                  ) : g.blocking ? (
                    <TriangleAlert className="size-3.5 text-conflicting" />
                  ) : (
                    <CircleDashed className="size-3.5 text-primary" />
                  )}
                  <span className={g.ok ? "flex-1 text-muted" : "flex-1 text-text"}>
                    {g.label}
                    {g.blocking && !g.ok && <span className="ml-1 text-[11px] text-conflicting">blocks</span>}
                  </span>
                  <span className="font-mono text-[11px] text-subtle">{g.detail}</span>
                </li>
              ))}
            </ul>
            <div className="border-t border-border px-4 py-3">
              <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-subtle">12-item checklist</h3>
              <ul className="grid grid-cols-1 gap-1">
                {checklist.map((r) => (
                  <li key={r.key} className="flex items-center gap-2 text-xs">
                    {r.state === "covered" ? (
                      <Check className="size-3 text-verified" />
                    ) : r.state === "partial" ? (
                      <Minus className="size-3 text-primary" />
                    ) : (
                      <CircleDashed className="size-3 text-missing" />
                    )}
                    <span className={r.state === "covered" ? "flex-1 text-muted" : "flex-1 text-text"}>{r.label}</span>
                    <span className="font-mono text-[11px] text-subtle">{r.verified}/{r.claims}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-2 border-t border-border px-4 py-3">
              {handover && (
                <ApprovePanel
                  slug={slug}
                  nextVersion={nextVersion}
                  blockers={blockers}
                  disabledReason={disabledReason}
                  summary={[
                    { label: "Claims", value: String(active.length) },
                    { label: "Confirmed", value: String(active.filter((c) => c.grade === "VERIFIED").length) },
                    { label: "Edited", value: String(edited) },
                    { label: "Rejected", value: String(rejected) },
                  ]}
                />
              )}
              <p className="text-xs text-subtle">
                {blockers.length > 0
                  ? `Blocked by ${blockers.length} item${blockers.length === 1 ? "" : "s"}. Resolve them, or approve with an override and a written note (stored in the version and the audit log).`
                  : advisories.every((a) => a.ok)
                    ? "All gates pass."
                    : "No blockers. Open advisories are listed on the receipt."}
              </p>
            </div>
            <div className="border-t border-border px-4 py-3">
              <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-subtle">
                <History className="size-3" /> Versions
              </h3>
              {versions.length > 0 ? (
                <ul className="space-y-1.5">
                  <li className="flex items-center justify-between text-xs">
                    <span className="font-mono text-primary">draft</span>
                    <Link href={`?diff=${latest}..draft`} scroll={false} className="text-muted hover:text-text hover:underline">
                      changes since v{latest}
                    </Link>
                  </li>
                  {versions.map((v) => (
                    <li key={v.id} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2 text-xs" data-testid="version-row">
                      <span className="font-mono text-text">v{v.number}</span>
                      <span className="truncate text-muted">
                        {v.approvedBy?.name ?? "—"} · <span className="font-mono text-subtle">{fmtDateTime(v.approvedAt)}</span>
                        {(v.snapshot as { approval?: { override?: boolean } } | null)?.approval?.override && (
                          <span className="ml-1 text-conflicting">override</span>
                        )}
                      </span>
                      {v.number > 1 ? (
                        <Link href={`?diff=${v.number - 1}..${v.number}`} scroll={false} className="text-muted hover:text-text hover:underline">
                          diff
                        </Link>
                      ) : (
                        <span />
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  className="px-3 py-3"
                  title="No approved versions yet"
                  description={`Draft changes vs nothing approved: ${active.length} claims, ${edited} edited, ${rejected} rejected.${lastEdit ? ` Last edit by ${lastEdit.actorName}, ${fmtDate(lastEdit.at)}.` : ""}`}
                />
              )}
            </div>
          </Card>
        </aside>
      </div>
    </>
  );
}
