import Link from "next/link";
import { ArrowRight, CircleCheck, GitCompareArrows, Lock, MessageSquareText } from "lucide-react";
import { can, getActor } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { getProject } from "@/lib/views/project";
import { loadClaims, type ClaimFull } from "@/lib/views/claims";
import { citationLabel, fmtDate, fmtDateYear } from "@/lib/views/format";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GradeChip } from "@/components/ui/grade-chip";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { EvidenceItem } from "@/components/ledger/claim-detail";
import { ResolveBar } from "@/components/conflicts/resolve-bar";
import { ActionButton } from "@/components/common/action-button";
import { requestAccess } from "@/app/_actions/claims";
import { cn } from "@/lib/utils";

function Side({ claim, side, slug }: { claim: ClaimFull; side: "A" | "B"; slug: string }) {
  const supports = claim.evidence.filter((e) => e.relation === "SUPPORTS");
  const sources = new Set(supports.map((e) => e.chunk.sourceId)).size;
  const authoritative = supports.some((e) => e.chunk.source.authoritative);
  return (
    <div className="min-w-0 p-4">
      <div className="mb-2 flex items-center gap-2">
        <span
          className={cn(
            "flex size-5 items-center justify-center rounded font-mono text-[11px] font-semibold",
            side === "A" ? "bg-single/15 text-single" : "bg-conflicting/15 text-conflicting",
          )}
        >
          {side}
        </span>
        <span className="font-mono text-[11px] text-subtle">{fmtDateYear(claim.date)}</span>
        {authoritative && (
          <Badge variant="success" size="sm">
            authoritative source
          </Badge>
        )}
        <span className="ml-auto font-mono text-[11px] text-subtle">
          {supports.length} quote{supports.length === 1 ? "" : "s"} · {sources} source{sources === 1 ? "" : "s"}
        </span>
      </div>
      <Link href={`/p/${slug}/ledger?claim=${claim.id}`} className="text-[14px] font-medium leading-snug text-text hover:underline">
        {claim.title}
      </Link>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">{claim.statement}</p>
      {claim.owner && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-subtle">
          <Avatar name={claim.owner.name} size={16} /> {claim.owner.name}
        </p>
      )}
      <div className="mt-3 space-y-2">
        {supports.slice(0, 2).map((e) => (
          <EvidenceItem key={e.id} e={e} tone={side === "B" ? "contradict" : "support"} compact />
        ))}
        {supports.length > 2 && (
          <p className="text-xs text-subtle">
            +{supports.length - 2} more:{" "}
            {supports
              .slice(2)
              .map((e) => citationLabel(e.chunk.source, e.chunk, e.matchStart))
              .join(", ")}
          </p>
        )}
      </div>
    </div>
  );
}

export default async function ConflictsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [project, actor] = await Promise.all([getProject(slug), getActor()]);
  const [{ visible }, conflicts, gaps] = await Promise.all([
    loadClaims(project.id, actor),
    prisma.conflict.findMany({ where: { projectId: project.id }, orderBy: { id: "asc" } }),
    prisma.gapQuestion.findMany({ where: { projectId: project.id }, orderBy: { priority: "desc" } }),
  ]);
  const byId = new Map(visible.map((c) => [c.id, c]));
  const contradicts = conflicts.filter((c) => c.kind === "CONTRADICTS");
  const shown = contradicts.filter((c) => byId.has(c.claimAId) && byId.has(c.claimBId));
  const hidden = contradicts.length - shown.length;
  const open = shown.filter((c) => c.status === "OPEN");
  const resolved = shown.filter((c) => c.status === "RESOLVED");
  const evolution = conflicts.filter((c) => c.kind === "SUPERSEDES" && byId.has(c.claimAId) && byId.has(c.claimBId));
  const canResolve = can(actor.role, "resolve_conflicts");
  const gapFor = (topic: string) => {
    const i = gaps.findIndex(
      (g) => g.kind === "CONFLICT" && g.relatedClaimId && byId.get(g.relatedClaimId)?.topicKey === topic,
    );
    return i < 0 ? null : { ...gaps[i], number: i + 1 };
  };

  return (
    <>
      <PageHeader
        title="Conflicts"
        description="Claims on the same topic that disagree, side by side with their quotes. Later decisions that replace earlier ones are evolution, not conflicts."
        meta={
          <>
            <span>
              <span className="font-mono text-conflicting">{open.length}</span> open
            </span>
            <span className="text-border">·</span>
            <span>
              <span className="font-mono text-muted">{resolved.length}</span> resolved
            </span>
            <span className="text-border">·</span>
            <span>
              <span className="font-mono text-muted">{evolution.length}</span> supersessions
            </span>
            {hidden > 0 && (
              <>
                <span className="text-border">·</span>
                <span className="inline-flex items-center gap-1">
                  <Lock className="size-3" /> {hidden} hidden at your access level
                </span>
              </>
            )}
          </>
        }
      />

      <div className="space-y-4">
        {open.length === 0 && (
          <EmptyState
            icon={<CircleCheck />}
            title={hidden > 0 ? "No conflicts visible at your access level" : "No open conflicts"}
            description={
              hidden > 0
                ? `${hidden} conflict${hidden === 1 ? "" : "s"} involve claims you cannot see. Ask the owner for access.`
                : "Every contradiction has been resolved. Review the evolution of decisions below, then continue to review."
            }
            action={
              hidden > 0 ? (
                <ActionButton action={requestAccess.bind(null, { slug, section: "Conflicts" })}>Request access</ActionButton>
              ) : (
                <Link href={`/p/${slug}/review`} className={buttonVariants({ size: "sm" })}>
                  Go to review
                </Link>
              )
            }
          />
        )}
        {open.map((cf) => {
          const a = byId.get(cf.claimAId)!;
          const b = byId.get(cf.claimBId)!;
          const gap = gapFor(cf.topicKey);
          const days = a.date && b.date ? Math.round(Math.abs(b.date.getTime() - a.date.getTime()) / 86400_000) : null;
          return (
            <Card key={cf.id} id={cf.id} className="scroll-mt-28 overflow-hidden">
              <CardHeader
                icon={<GitCompareArrows />}
                title={
                  <span className="flex items-center gap-2">
                    <span className="capitalize">{cf.topicKey.replace(/_/g, " ")}</span>
                    <GradeChip grade="CONFLICTING" />
                    <span className="font-mono text-[11px] font-normal text-subtle">{cf.id}</span>
                  </span>
                }
                description={`${cf.note ?? ""}${days !== null ? ` · ${days} days apart` : ""}`}
                actions={
                  gap && (
                    <Link
                      href={`/p/${slug}/interview#${gap.id}`}
                      className={buttonVariants({ variant: "ghost", size: "sm" })}
                    >
                      <MessageSquareText className="size-3.5" />
                      {gap.answer ? "Answered" : "Asked"} in interview · Q{gap.number}
                    </Link>
                  )
                }
              />
              <div className="grid grid-cols-2 divide-x divide-border">
                <Side claim={a} side="A" slug={slug} />
                <Side claim={b} side="B" slug={slug} />
              </div>
              <div className="border-t border-border bg-surface-2/40 px-4 py-2.5">
                <ResolveBar conflictId={cf.id} labelA="A" labelB="B" canResolve={canResolve} />
              </div>
            </Card>
          );
        })}

        {resolved.length > 0 && (
          <Card>
            <CardHeader title="Resolved" description="Kept for the audit trail" />
            <ul className="divide-y divide-border/70">
              {resolved.map((cf) => (
                <li key={cf.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                  <CircleCheck className="size-4 text-verified" />
                  <span className="capitalize text-text">{cf.topicKey.replace(/_/g, " ")}</span>
                  <span className="text-muted">kept {cf.resolution === "BOTH" ? "both" : cf.resolution}</span>
                  <span className="truncate text-xs text-subtle">{cf.note}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card>
          <CardHeader
            title="Evolution"
            description="SUPERSEDES: a later, better-supported decision replaced an earlier one. Shown on the timeline, never as a conflict."
          />
          <ul className="divide-y divide-border/70">
            {evolution.map((cf) => {
              const a = byId.get(cf.claimAId)!;
              const b = byId.get(cf.claimBId)!;
              const bSupports = b.evidence.filter((e) => e.relation === "SUPPORTS");
              return (
                <li key={cf.id} className="grid grid-cols-[minmax(0,1fr)_28px_minmax(0,1fr)_200px] items-start gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-subtle">{fmtDate(a.date)}</span>
                      <GradeChip grade={a.grade} compact />
                    </div>
                    <Link
                      href={`/p/${slug}/ledger?claim=${a.id}`}
                      className="mt-0.5 block truncate text-[13px] text-subtle line-through decoration-subtle/50 hover:text-muted"
                    >
                      {a.title}
                    </Link>
                    <p className="truncate text-xs text-subtle">{a.gradeReason}</p>
                  </div>
                  <ArrowRight className="mt-5 size-4 text-verified" aria-label="superseded by" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-subtle">{fmtDate(b.date)}</span>
                      <GradeChip grade={b.grade} compact />
                    </div>
                    <Link href={`/p/${slug}/ledger?claim=${b.id}`} className="mt-0.5 block truncate text-[13px] text-text hover:underline">
                      {b.title}
                    </Link>
                    <p className="truncate text-xs text-muted">{b.gradeReason}</p>
                  </div>
                  <div className="text-xs text-muted">
                    <p>{cf.note}</p>
                    <p className="mt-1 font-mono text-[11px] text-subtle">
                      {bSupports
                        .slice(0, 3)
                        .map((e) => citationLabel(e.chunk.source, e.chunk, e.matchStart))
                        .join(" · ")}
                    </p>
                  </div>
                </li>
              );
            })}
            {evolution.length === 0 && (
              <li className="px-4 py-4 text-[13px] text-muted">No supersessions visible at your access level.</li>
            )}
          </ul>
        </Card>
      </div>
    </>
  );
}
