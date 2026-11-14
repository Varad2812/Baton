import Link from "next/link";
import { Check, CircleDashed, History, Lock, Minus } from "lucide-react";
import { can, getActor } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { getProject } from "@/lib/views/project";
import { loadClaims } from "@/lib/views/claims";
import { evaluateChecklist } from "@/lib/views/checklist";
import { SECTION_ORDER } from "@/lib/views/handover";
import { fmtDate, fmtDateTime, GRADE_ORDER, TYPE_LABEL } from "@/lib/views/format";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GradeChip } from "@/components/ui/grade-chip";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { GradeBar } from "@/components/common/grade-bar";
import { ClaimActions } from "@/components/ledger/claim-actions";
import { ApprovePanel } from "@/components/review/approve-panel";
import { cn } from "@/lib/utils";

export default async function ReviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [project, actor] = await Promise.all([getProject(slug), getActor()]);
  const [{ visible, hiddenCount }, handover, conflicts, gaps, evidence, lastEdit] = await Promise.all([
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
  ]);
  const active = visible.filter((c) => c.status !== "REJECTED");
  const checklist = evaluateChecklist(active, gaps);
  const openConflicts = conflicts.filter((c) => c.status === "OPEN").length;
  const openGaps = gaps.filter((g) => !g.answer).length;
  const missing = active.filter((c) => c.grade === "MISSING").length;
  const validQ = evidence.find((e) => e.quoteValid)?._count ?? 0;
  const totalQ = evidence.reduce((s, e) => s + e._count, 0);
  const edited = visible.filter((c) => c.status === "EDITED").length;
  const rejected = visible.filter((c) => c.status === "REJECTED").length;
  const nextVersion = (handover?.currentVersion ?? 0) + 1;
  const canEdit = can(actor.role, "edit_claims");

  const gates = [
    { label: "All quotes string-matched", ok: validQ === totalQ, detail: `${validQ}/${totalQ}` },
    { label: "No open contradictions", ok: openConflicts === 0, detail: `${openConflicts} open` },
    {
      label: "Checklist covered",
      ok: checklist.every((r) => r.state === "covered"),
      detail: `${checklist.filter((r) => r.state === "covered").length}/12`,
    },
    { label: "Gap questions answered", ok: openGaps === 0, detail: `${gaps.length - openGaps}/${gaps.length}` },
    { label: "Missing items acknowledged", ok: missing === 0, detail: `${missing} missing` },
  ];
  const blockers = gates.filter((g) => !g.ok).map((g) => `${g.label}: ${g.detail}`);
  const disabledReason =
    actor.role === "OWNER"
      ? "No self-approval: the departing owner cannot approve their own handover"
      : !can(actor.role, "approve_version")
        ? "Only the reviewer (Prof. S. Rao) can approve a version"
        : null;

  const sections = [
    ...SECTION_ORDER.filter((s) => visible.some((c) => c.section === s)),
    ...[...new Set(visible.map((c) => c.section))].filter((s) => !SECTION_ORDER.includes(s)),
  ];

  return (
    <>
      <PageHeader
        title="Review"
        description="The reviewer checks every section, edits or rejects claims, and approves an immutable version. Each approval compiles a separate role-safe view per persona."
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

      <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-4">
        <div className="space-y-3">
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
                  actions={<GradeBar grades={grades} className="w-40" />}
                />
                <ul className="divide-y divide-border/70">
                  {items.map((c) => (
                    <li key={c.id} className={cn("grid grid-cols-[112px_minmax(0,1fr)_auto] items-start gap-3 px-4 py-2.5", c.status === "REJECTED" && "opacity-55")}>
                      <div className="pt-0.5">
                        <GradeChip grade={c.grade} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Link
                            href={`/p/${slug}/ledger?claim=${c.id}`}
                            className={cn("text-[13px] text-text hover:underline", c.status === "REJECTED" && "line-through")}
                          >
                            {c.title}
                          </Link>
                          <span className="text-[11px] text-subtle">{TYPE_LABEL[c.type]}</span>
                          {c.status === "EDITED" && <Badge variant="info" size="sm">edited</Badge>}
                          {c.status === "REJECTED" && <Badge variant="danger" size="sm">rejected</Badge>}
                          {c.fromTestimony && <Badge variant="testimony" size="sm">testimony</Badge>}
                        </div>
                        <p className={cn("mt-0.5 line-clamp-2 text-xs leading-relaxed", c.grade === "INFERRED" ? "italic text-muted" : "text-muted")}>
                          {c.statement}
                        </p>
                        {c.reviewerNote && (
                          <p className="mt-1 text-xs text-single">
                            <span className="text-subtle">Reviewer note:</span> {c.reviewerNote}
                          </p>
                        )}
                      </div>
                      <ClaimActions claimId={c.id} statement={c.statement} canEdit={canEdit} canAsk={false} compact />
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
          {hiddenCount > 0 && (
            <p className="flex items-center gap-2 rounded-lg border border-dashed border-border px-4 py-3 text-[13px] text-muted">
              <Lock className="size-4 text-subtle" /> {hiddenCount} claim{hiddenCount === 1 ? "" : "s"} hidden at your access
              level are not shown for review.
            </p>
          )}
        </div>

        <aside className="space-y-4">
          <Card className="sticky top-28">
            <CardHeader title="Approval" description={`Draft for v${nextVersion}`} />
            <ul className="space-y-2 px-4 py-3">
              {gates.map((g) => (
                <li key={g.label} className="flex items-center gap-2 text-[13px]">
                  {g.ok ? (
                    <Check className="size-3.5 text-verified" />
                  ) : (
                    <CircleDashed className="size-3.5 text-primary" />
                  )}
                  <span className={g.ok ? "flex-1 text-muted" : "flex-1 text-text"}>{g.label}</span>
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
                  handoverId={handover.id}
                  nextVersion={nextVersion}
                  blockers={blockers}
                  disabledReason={disabledReason}
                  summary={[
                    { label: "Claims", value: String(active.length) },
                    { label: "Verified", value: String(active.filter((c) => c.grade === "VERIFIED").length) },
                    { label: "Edited", value: String(edited) },
                    { label: "Rejected", value: String(rejected) },
                  ]}
                />
              )}
              <p className="text-xs text-subtle">
                {blockers.length > 0
                  ? `${blockers.length} gate${blockers.length === 1 ? "" : "s"} open. The reviewer may still approve; open items are listed on the receipt.`
                  : "All gates pass."}
              </p>
            </div>
            <div className="border-t border-border px-4 py-3">
              <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-subtle">
                <History className="size-3" /> Versions
              </h3>
              {handover && handover.versions.length > 0 ? (
                <ul className="space-y-1.5">
                  {handover.versions.map((v) => (
                    <li key={v.id} className="flex items-center justify-between text-xs">
                      <span className="font-mono text-text">v{v.number}</span>
                      <span className="text-muted">{v.approvedBy?.name ?? "—"}</span>
                      <span className="font-mono text-subtle">{fmtDateTime(v.approvedAt)}</span>
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
