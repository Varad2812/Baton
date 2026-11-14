import Link from "next/link";
import { CalendarClock, FileText, Lock, MessageSquareText, Printer } from "lucide-react";
import { can, getActor } from "@/lib/authz";
import { getProject } from "@/lib/views/project";
import { getHandoverView, type PlanItem } from "@/lib/views/handover";
import { fmtDate, fmtDateTime, ROLE_LABEL } from "@/lib/views/format";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GradeChip } from "@/components/ui/grade-chip";
import { Avatar } from "@/components/ui/avatar";
import { Tooltip } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { AcknowledgeButton, FollowUpButton } from "@/components/handover/handover-actions";
import { cn } from "@/lib/utils";

const PLAN_TONE: Record<PlanItem["kind"], string> = {
  conflict: "bg-conflicting",
  missing: "bg-missing",
  risk: "bg-conflicting/70",
  task: "bg-single",
  inferred: "bg-inferred",
  recurring: "bg-verified",
};

function Plan({ title, items, slug, empty }: { title: string; items: PlanItem[]; slug: string; empty: string }) {
  return (
    <Card>
      <CardHeader
        icon={<CalendarClock />}
        title={title}
        actions={<Badge variant="count">{items.length}</Badge>}
      />
      {items.length === 0 ? (
        <p className="px-4 py-4 text-[13px] text-muted">{empty}</p>
      ) : (
        <ol className="divide-y divide-border/70">
          {items.map((p, i) => (
            <li key={p.id} className="grid grid-cols-[20px_minmax(0,1fr)_auto] gap-2.5 px-4 py-2.5">
              <span className="pt-0.5 font-mono text-[11px] text-subtle">{i + 1}</span>
              <div className="min-w-0">
                <div className="flex items-start gap-2">
                  <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", PLAN_TONE[p.kind])} />
                  <Link href={`/p/${slug}/ledger?claim=${p.claimId}`} className="text-[13px] leading-snug text-text hover:underline">
                    {p.title}
                  </Link>
                </div>
                <p className="mt-0.5 line-clamp-2 pl-3.5 text-xs leading-relaxed text-subtle">{p.why}</p>
                {p.citations.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1 pl-3.5">
                    {p.citations.slice(0, 3).map((c) => (
                      <Tooltip key={c.label} content={<span className="font-mono">“{c.quote}”</span>}>
                        <span className="rounded bg-surface-2 px-1 font-mono text-[10.5px] text-muted">{c.label}</span>
                      </Tooltip>
                    ))}
                  </div>
                )}
              </div>
              <span className="font-mono text-[11px] text-subtle">{p.due ? `due ${fmtDate(p.due)}` : ""}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

export default async function HandoverPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [project, actor] = await Promise.all([getProject(slug), getActor()]);
  const v = await getHandoverView(project.id, actor);
  if (!v.handover) {
    return (
      <EmptyState
        icon={<FileText />}
        title="No handover started"
        description="Connect sources and run the pipeline first; the handover is compiled from the evidence ledger."
        action={
          <Link href={`/p/${slug}/sources`} className={buttonVariants({ size: "sm" })}>
            Connect sources
          </Link>
        }
      />
    );
  }
  const h = v.handover;
  const canAck = can(actor.role, "acknowledge");
  const canAsk = can(actor.role, "ask_followups");
  const ackReason =
    actor.role === "INCOMING" ? "Acknowledge after the reviewer approves a version" : `Only ${h.to.name} (incoming) acknowledges sections`;
  const approved = !!v.latestVersion;
  const slugify = (s: string) => s.replace(/\W+/g, "-").toLowerCase();

  return (
    <>
      <PageHeader
        title={`Handover to ${h.to.name.split(" ")[0]}`}
        description={`${h.from.name} → ${h.to.name}, reviewed by ${h.reviewer.name}. Compiled only from claims your role may see; the plan never cites a hidden source.`}
        actions={
          <Link href={`/p/${slug}/handover/receipt`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Printer className="size-3.5" />
            Receipt
          </Link>
        }
      />

      {/* Role-compiled banner */}
      <div className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-lg border border-border bg-surface px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px]">
          <span className="inline-flex items-center gap-2">
            <Avatar name={actor.name} size={22} />
            <span className="text-muted">Compiled for</span>
            <span className="font-medium text-text">{actor.name}</span>
            <Badge variant="outline" size="sm" className="font-mono uppercase">
              {ROLE_LABEL[actor.role]}
            </Badge>
          </span>
          <span className="text-muted">
            <span className="font-mono text-text">{v.sections.reduce((n, s) => n + s.claims.length, 0)}</span> claims ·{" "}
            <span className="font-mono text-text">{v.sourceChunkIds.length}</span> source chunks
          </span>
          {v.hiddenCount > 0 ? (
            <span className="inline-flex items-center gap-1.5 text-muted">
              <Lock className="size-3.5" />
              <span className="font-mono text-text">{v.hiddenCount}</span> hidden at your access level
            </span>
          ) : (
            <span className="text-subtle">Nothing hidden at your access level</span>
          )}
        </div>
        <div className="text-right text-xs">
          {approved ? (
            <span className="text-verified">
              v{v.latestVersion!.number} approved by {v.latestVersion!.approvedBy} · {fmtDateTime(v.latestVersion!.approvedAt)}
            </span>
          ) : (
            <Tooltip content="No version is approved yet. This preview is compiled live from the current draft; approval freezes it as v1.">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-primary">
                Draft preview · not yet approved
              </span>
            </Tooltip>
          )}
        </div>
      </div>

      <div className="grid grid-cols-[200px_minmax(0,1fr)] gap-6">
        {/* TOC */}
        <nav aria-label="Sections" className="sticky top-28 h-fit space-y-0.5 text-[13px]">
          <a href="#overview" className="block rounded-md px-2 py-1 text-muted hover:bg-surface-2/60 hover:text-text">
            Overview
          </a>
          <a href="#plan" className="block rounded-md px-2 py-1 text-muted hover:bg-surface-2/60 hover:text-text">
            7 / 30-day plan
          </a>
          <div className="my-2 h-px bg-border" />
          {v.sections.map((s) => (
            <a
              key={s.name}
              href={`#${slugify(s.name)}`}
              className="flex items-center gap-2 rounded-md px-2 py-1 text-muted hover:bg-surface-2/60 hover:text-text"
            >
              <span
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  v.acknowledged.includes(s.name) ? "bg-verified" : "bg-transparent ring-1 ring-subtle",
                )}
              />
              <span className="flex-1 truncate">{s.name}</span>
              <span className="font-mono text-[11px] text-subtle">{s.claims.length}</span>
            </a>
          ))}
          <div className="my-2 h-px bg-border" />
          <p className="px-2 text-xs text-subtle">
            {v.acknowledged.length}/{v.sections.length} sections acknowledged
          </p>
        </nav>

        <div className="min-w-0 space-y-4">
          <Card id="overview" className="scroll-mt-28">
            <CardHeader title="Overview" description={`As of ${v.asOfLabel} · fest 30 Apr – 2 May`} />
            <div className="grid grid-cols-[minmax(0,1fr)_220px] gap-6 px-4 py-4">
              <p className="text-[14px] leading-relaxed text-text">{v.overview}</p>
              <dl className="space-y-1.5 border-l border-border pl-4 text-[13px]">
                {[
                  ["Verified facts", v.counts.verified],
                  ["Open conflicts", v.counts.conflicts],
                  ["Risks", v.counts.risks],
                  ["No record", v.counts.missing],
                  ["Follow-ups", v.followUps.length],
                ].map(([k, n]) => (
                  <div key={k} className="flex justify-between">
                    <dt className="text-muted">{k}</dt>
                    <dd className="font-mono text-text">{n}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </Card>

          <div id="plan" className="grid scroll-mt-28 grid-cols-2 gap-4">
            <Plan title="First 7 days" items={v.plan7} slug={slug} empty="Nothing urgent at your access level." />
            <Plan title="Days 8–30" items={v.plan30} slug={slug} empty="No follow-on work at your access level." />
          </div>

          {v.sections.map((s) => (
            <Card key={s.name} id={slugify(s.name)} className="scroll-mt-28">
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    {s.name}
                    <span className="font-mono text-[11px] font-normal text-subtle">{s.claims.length}</span>
                  </span>
                }
                actions={
                  <>
                    <FollowUpButton handoverId={h.id} section={s.name} canAsk={canAsk} />
                    <AcknowledgeButton
                      handoverId={h.id}
                      section={s.name}
                      acknowledged={v.acknowledged.includes(s.name)}
                      canAck={canAck && approved}
                      reason={ackReason}
                    />
                  </>
                }
              />
              <ul className="divide-y divide-border/70">
                {s.claims.map((c) => (
                  <li key={c.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[13.5px] font-medium text-text">{c.title}</span>
                        {c.fromTestimony && <Badge variant="testimony" size="sm">testimony</Badge>}
                      </div>
                      <p
                        className={cn(
                          "mt-0.5 text-[13px] leading-relaxed",
                          c.grade === "INFERRED" ? "italic text-muted" : "text-muted",
                        )}
                      >
                        {c.grade === "INFERRED" && <span className="not-italic text-inferred">Inferred: </span>}
                        {c.statement}
                        {c.citations.map((ct) => (
                          <Tooltip key={ct.label} content={<span className="font-mono">“{ct.quote}”</span>}>
                            <Link
                              href={`/p/${slug}/ledger?claim=${c.id}`}
                              className="ml-1 rounded bg-surface-2 px-1 align-baseline font-mono text-[10.5px] not-italic text-muted hover:text-text"
                            >
                              {ct.label}
                            </Link>
                          </Tooltip>
                        ))}
                      </p>
                      {c.owner && (
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-subtle">
                          <Avatar name={c.owner} size={14} /> {c.owner}
                          {c.date && <span className="font-mono">· {fmtDate(c.date)}</span>}
                        </p>
                      )}
                    </div>
                    <GradeChip grade={c.grade} />
                  </li>
                ))}
                {s.hidden > 0 && (
                  <li className="flex items-center gap-2 px-4 py-2.5 text-xs text-subtle">
                    <Lock className="size-3" /> {s.hidden} claim{s.hidden === 1 ? "" : "s"} hidden — request access from owner
                  </li>
                )}
              </ul>
            </Card>
          ))}

          <Card>
            <CardHeader icon={<MessageSquareText />} title="Follow-ups" description="Questions asked after reading the handover" />
            {v.followUps.length === 0 ? (
              <div className="flex items-center justify-between gap-4 px-4 py-4">
                <p className="text-[13px] text-muted">
                  No follow-ups yet. {canAsk ? "Ask Meera anything the records don't answer." : `${h.to.name} can ask Meera questions from any section.`}
                </p>
                <FollowUpButton handoverId={h.id} canAsk={canAsk} label="Ask a question" />
              </div>
            ) : (
              <ul className="divide-y divide-border/70">
                {v.followUps.map((f) => (
                  <li key={f.id} className="px-4 py-3 text-[13px]">
                    <p className="text-text">{f.question}</p>
                    <p className="mt-0.5 text-xs text-subtle">
                      {f.askedBy} · {fmtDateTime(f.createdAt)} {f.section && `· ${f.section}`}
                    </p>
                    {f.answer && <p className="mt-1.5 border-l-2 border-testimony/50 pl-2.5 text-muted">{f.answer}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
