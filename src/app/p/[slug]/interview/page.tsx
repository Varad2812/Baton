import Link from "next/link";
import { CircleCheck, Lock, MessageSquareText, Mic } from "lucide-react";
import type { GapKind, Grade } from "@/generated/prisma/enums";
import { priorityTier } from "@/lib/handover/gates";
import { FollowUpAnswer } from "@/components/interview/follow-up-answer";
import { can, getActor, projectPersonas } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { getProject } from "@/lib/views/project";
import { loadClaims } from "@/lib/views/claims";
import { evaluateChecklist } from "@/lib/views/checklist";
import { citationsFor } from "@/lib/views/handover";
import { fmtDateTime } from "@/lib/views/format";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GradeChip } from "@/components/ui/grade-chip";
import { Avatar } from "@/components/ui/avatar";
import { Tooltip } from "@/components/ui/tooltip";
import { AnswerBox } from "@/components/interview/answer-box";
import { cn } from "@/lib/utils";

const KIND: Record<GapKind, { label: string; cls: string; weight: number; why: string }> = {
  CONFLICT: { label: "Conflict", cls: "border-conflicting/35 bg-conflicting/10 text-conflicting", weight: 9, why: "Sources disagree" },
  MISSING: { label: "Missing", cls: "border-missing/40 bg-missing/10 text-missing", weight: 8, why: "No record at all" },
  SINGLE_OWNER: { label: "Single owner", cls: "border-primary/35 bg-primary/10 text-primary", weight: 7, why: "Bus factor 1" },
  RECURRING: { label: "Recurring", cls: "border-single/35 bg-single/10 text-single", weight: 6, why: "Keeps coming back" },
  INFERRED: { label: "Inferred", cls: "border-dashed border-inferred/50 bg-inferred/5 text-inferred", weight: 4, why: "Model inference" },
};

export default async function InterviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [project, actor, personas] = await Promise.all([getProject(slug), getActor(slug), projectPersonas(slug)]);
  const owner = personas.meera;
  const ownerFirst = owner.name.split(" ")[0];
  const [{ visible }, gaps, answers, followUps] = await Promise.all([
    loadClaims(project.id, actor),
    prisma.gapQuestion.findMany({
      where: { projectId: project.id },
      orderBy: [{ priority: "desc" }, { id: "asc" }],
      include: { testimonySource: { select: { id: true, title: true, createdAt: true } } },
    }),
    prisma.auditLog.findMany({
      where: { projectId: project.id, action: "interview.answer" },
      select: { targetId: true, meta: true },
    }),
    can(actor.role, "see_team")
      ? prisma.followUp.findMany({
          where: { handover: { projectId: project.id } },
          orderBy: { createdAt: "desc" },
          include: { askedBy: { select: { name: true } }, claim: { select: { id: true, title: true } } },
        })
      : Promise.resolve([]),
  ]);
  const gradeChange = new Map(
    answers.map((a) => {
      const m = (a.meta ?? {}) as { gradeBefore?: Grade | null; gradeAfter?: Grade };
      return [a.targetId, { before: m.gradeBefore ?? null, after: m.gradeAfter ?? null }] as const;
    }),
  );
  const byId = new Map(visible.map((c) => [c.id, c]));
  const shown = gaps.filter((g) => !g.relatedClaimId || byId.has(g.relatedClaimId));
  const firstOpenId = shown.find((g) => !g.answer)?.id;
  const hidden = gaps.length - shown.length;
  const answered = shown.filter((g) => g.answer);
  const open = shown.filter((g) => !g.answer);
  const maxP = Math.max(...gaps.map((g) => g.priority), 1);
  const canAnswer = can(actor.role, "answer_interview");
  const checklist = evaluateChecklist(visible.filter((c) => c.status !== "REJECTED"), shown);
  const testimonyClaims = visible.filter((c) => c.fromTestimony);
  const canAnswerFollowUps = can(actor.role, "answer_followups");
  const inbox = followUps.filter((f) => !f.claimId || byId.has(f.claimId));
  const openFollowUps = inbox.filter((f) => !f.answer);

  return (
    <>
      <PageHeader
        title="Gap interview"
        description="Only what the records can't answer. Each question exists because a checklist item is missing, sources conflict, or knowledge sits with one person. Answers become testimony, cited like any other source."
        meta={
          <>
            <span className="inline-flex items-center gap-1.5">
              <Avatar name={owner.name} size={16} /> Interviewee: {owner.name} ({slug === "festflow" ? "graduating May 2026" : owner.roleTitle})
            </span>
            <span className="text-border">·</span>
            <span>
              <span className="font-mono text-muted">{answered.length}</span> of{" "}
              <span className="font-mono text-muted">{shown.length}</span> answered
            </span>
            <span className="text-border">·</span>
            <span>Priority = risk weight × dependent claims</span>
            {hidden > 0 && (
              <>
                <span className="text-border">·</span>
                <span className="inline-flex items-center gap-1">
                  <Lock className="size-3" /> {hidden} hidden
                </span>
              </>
            )}
          </>
        }
      />
      <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-4">
        <div className="min-w-0 space-y-3">
        {inbox.length > 0 && (
          <Card id="follow-ups" className="scroll-mt-28">
            <CardHeader
              icon={<MessageSquareText />}
              title="Follow-up inbox"
              description={`Questions ${canAnswerFollowUps ? "for you" : `for ${ownerFirst}`} from the handover · ${openFollowUps.length} open`}
            />
            <ul className="divide-y divide-border/70">
              {[...openFollowUps, ...inbox.filter((f) => f.answer)].map((f) => (
                <li key={f.id} id={f.id} className="px-4 py-3 text-[13px]" data-testid="follow-up">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-subtle">
                    <Avatar name={f.askedBy.name} size={16} />
                    <span className="text-muted">{f.askedBy.name}</span>
                    <span className="font-mono">{fmtDateTime(f.createdAt)}</span>
                    {f.claim ? (
                      <Link href={`/p/${slug}/ledger?claim=${f.claim.id}`} className="truncate hover:text-text hover:underline">
                        on {f.claim.title}
                      </Link>
                    ) : (
                      f.section && <span>· {f.section}</span>
                    )}
                    {f.answer ? <Badge variant="success" size="sm">answered</Badge> : <Badge variant="primary" size="sm">open</Badge>}
                  </div>
                  <p className="mt-1 text-text">{f.question}</p>
                  {f.answer ? (
                    <p className="mt-1.5 border-l-2 border-testimony/50 pl-2.5 text-muted">
                      {f.answer} <span className="font-mono text-[11px] text-subtle">· {fmtDateTime(f.answeredAt)}</span>
                    </p>
                  ) : canAnswerFollowUps ? (
                    <FollowUpAnswer slug={slug} followUpId={f.id} />
                  ) : (
                    <p className="mt-1 text-xs text-subtle">Waiting for {ownerFirst}. Only the owner answers follow-ups.</p>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}
        <ol className="space-y-3">
          {shown.map((g) => {
            const rank = gaps.indexOf(g) + 1;
            const claim = g.relatedClaimId ? byId.get(g.relatedClaimId) : undefined;
            const k = KIND[g.kind];
            const cites = claim ? citationsFor(claim).slice(0, 4) : [];
            return (
              <li key={g.id} id={g.id} className="scroll-mt-28">
                <Card className={cn(g.answer && "border-border/60")} data-tour={g.id === firstOpenId ? "interview" : undefined}>
                  <div className="grid grid-cols-[52px_minmax(0,1fr)] gap-0">
                    <div className="flex flex-col items-center gap-2 border-r border-border py-4">
                      <span className="font-mono text-[11px] text-subtle">Q{rank}</span>
                      <Tooltip content={`Priority ${g.priority}: ${k.why}, weighted by the claims that depend on the answer`}>
                        <span className="flex flex-col items-center gap-1">
                          <span className="relative h-14 w-1.5 overflow-hidden rounded-full bg-surface-2">
                            <span
                              className={cn("absolute inset-x-0 bottom-0 rounded-full", g.answer ? "bg-verified/60" : "bg-primary")}
                              style={{ height: `${(g.priority / maxP) * 100}%` }}
                            />
                          </span>
                          <span className="font-mono text-[11px] text-muted">{g.priority}</span>
                        </span>
                      </Tooltip>
                    </div>
                    <div className="min-w-0 p-4">
                      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                        <span className={cn("inline-flex h-5 items-center rounded-[4px] border px-1.5 text-[11px] font-medium", k.cls)}>
                          {k.label}
                        </span>
                        <span
                          className={cn(
                            "inline-flex h-5 items-center rounded-[4px] border px-1.5 font-mono text-[11px] font-medium",
                            priorityTier(g.priority) === "P1" ? "border-conflicting/40 text-conflicting" : "border-border text-muted",
                          )}
                        >
                          {priorityTier(g.priority)}
                        </span>
                        {g.checklistKey && (
                          <Badge variant="outline" size="sm" className="font-mono">
                            {g.checklistKey}
                          </Badge>
                        )}
                        {g.answer && (
                          <Badge variant="success" size="sm">
                            <CircleCheck className="size-3" /> answered
                          </Badge>
                        )}
                      </div>
                      <h2 className="text-[14.5px] font-medium leading-snug text-text">{g.question}</h2>
                      <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{g.rationale}</p>
                      {(claim || cites.length > 0) && (
                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
                          {claim && (
                            <Link
                              href={`/p/${slug}/ledger?claim=${claim.id}`}
                              className="inline-flex items-center gap-1.5 rounded border border-border px-1.5 py-0.5 text-muted hover:bg-surface-2 hover:text-text"
                            >
                              <GradeChip grade={claim.grade} compact className="h-auto border-0 bg-transparent px-0" />
                              <span className="max-w-[340px] truncate">{claim.title}</span>
                            </Link>
                          )}
                          {cites.map((c) => (
                            <Tooltip key={c.label} content={<span className="font-mono">“{c.quote}”</span>}>
                              <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-subtle">{c.label}</span>
                            </Tooltip>
                          ))}
                        </div>
                      )}
                      <div className="mt-3">
                        {g.answer ? (
                          <div className="rounded-md border border-testimony/35 bg-testimony/[0.06] px-3 py-2.5">
                            <div className="mb-1 flex items-center gap-2 text-xs">
                              <Mic className="size-3 text-[#a98be8]" />
                              <span className="font-medium text-[#c4b0f0]">Testimony from {owner.name}</span>
                              <span className="font-mono text-[11px] text-subtle">{fmtDateTime(g.answeredAt)}</span>
                              {g.testimonySource && (
                                <span className="ml-auto font-mono text-[11px] text-subtle">{g.testimonySource.id}</span>
                              )}
                            </div>
                            <p className="text-[13px] leading-relaxed text-text">{g.answer}</p>
                            {claim && (
                              <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-testimony/20 pt-2 text-xs text-muted" data-testid="grade-change">
                                <span className="text-subtle">Ledger:</span>
                                {gradeChange.get(g.id)?.before && gradeChange.get(g.id)!.before !== claim.grade ? (
                                  <>
                                    <GradeChip grade={gradeChange.get(g.id)!.before!} compact />
                                    <span aria-label="became">→</span>
                                  </>
                                ) : null}
                                <GradeChip grade={claim.grade} compact />
                                <Link href={`/p/${slug}/ledger?claim=${claim.id}`} className="truncate text-muted hover:text-text hover:underline">
                                  {claim.title}
                                </Link>
                                <Badge variant="testimony" size="sm">testimony</Badge>
                              </div>
                            )}
                          </div>
                        ) : (
                          <AnswerBox
                            slug={slug}
                            questionId={g.id}
                            canAnswer={canAnswer}
                            placeholder={
                              g.kind === "CONFLICT"
                                ? "Which is right, and why did it change? Name who decided."
                                : "Answer in your own words. Names, where things live, and who to ask next."
                            }
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ol>
        </div>

        <aside className="space-y-4">
          <Card className="sticky top-28">
            <CardHeader title="Progress" description={`${open.length} open · ${answered.length} answered`} />
            <div className="px-4 py-3">
              <div className="flex h-1.5 gap-px overflow-hidden rounded-full bg-surface-2">
                <span className="bg-verified" style={{ width: `${(answered.length / Math.max(1, shown.length)) * 100}%` }} />
              </div>
              <ul className="mt-3 space-y-1.5">
                {(Object.keys(KIND) as GapKind[]).map((kind) => {
                  const all = shown.filter((g) => g.kind === kind);
                  if (all.length === 0) return null;
                  return (
                    <li key={kind} className="flex items-center justify-between text-xs">
                      <span className="text-muted">{KIND[kind].label}</span>
                      <span className="font-mono text-subtle">
                        {all.filter((g) => g.answer).length}/{all.length}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="border-t border-border px-4 py-3">
              <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-subtle">Handover checklist</h3>
              <ul className="space-y-1">
                {checklist.map((r) => (
                  <li key={r.key} className="flex items-center gap-2 text-xs">
                    <span
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        r.state === "covered" ? "bg-verified" : r.state === "partial" ? "bg-primary" : "bg-transparent ring-1 ring-missing",
                      )}
                    />
                    <span className={r.state === "covered" ? "flex-1 text-muted" : "flex-1 text-text"}>{r.label}</span>
                    {r.openGaps > 0 && <span className="font-mono text-[11px] text-primary">{r.openGaps} q</span>}
                  </li>
                ))}
              </ul>
            </div>
            {testimonyClaims.length > 0 && (
              <div className="border-t border-border px-4 py-3">
                <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-subtle">Claims from testimony</h3>
                <ul className="space-y-1.5">
                  {testimonyClaims.map((c) => (
                    <li key={c.id}>
                      <Link href={`/p/${slug}/ledger?claim=${c.id}`} className="line-clamp-2 text-xs text-muted hover:text-text">
                        {c.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}
