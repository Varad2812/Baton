import Link from "next/link";
import { CalendarClock, FileText, Lock, MessageSquareText, Printer, ShieldCheck } from "lucide-react";
import { can, getActor } from "@/lib/authz";
import { getProject } from "@/lib/views/project";
import { getHandoverPage, type PlanItem } from "@/lib/views/handover";
import { fmtDate, fmtDateTime, ROLE_LABEL } from "@/lib/views/format";
import { requestAccess } from "@/app/_actions/claims";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GradeChip } from "@/components/ui/grade-chip";
import { Avatar } from "@/components/ui/avatar";
import { Tooltip } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { ActionButton } from "@/components/common/action-button";
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

const slugify = (s: string) => s.replace(/\W+/g, "-").toLowerCase();

function Plan({
  title,
  section,
  items,
  slug,
  empty,
  ack,
}: {
  title: string;
  section: string;
  items: PlanItem[];
  slug: string;
  empty: string;
  ack: React.ReactNode;
}) {
  return (
    <Card id={slugify(section)} className="scroll-mt-28">
      <CardHeader
        icon={<CalendarClock />}
        title={
          <span className="flex items-center gap-2">
            {title} <Badge variant="count">{items.length}</Badge>
          </span>
        }
        actions={ack}
      />
      {items.length === 0 ? (
        <p className="px-4 py-4 text-[13px] text-muted">{empty}</p>
      ) : (
        <ol className="divide-y divide-border/70">
          {items.map((p, i) => (
            <li key={p.id} className="grid grid-cols-[20px_minmax(0,1fr)] gap-2.5 px-4 py-2.5">
              <span className="pt-0.5 font-mono text-[11px] text-subtle">{i + 1}</span>
              <div className="min-w-0">
                <div className="flex items-start gap-2">
                  <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", PLAN_TONE[p.kind])} />
                  {p.claimId ? (
                    <Link href={`/p/${slug}/ledger?claim=${p.claimId}`} className="text-[13px] leading-snug text-text hover:underline">
                      {p.text}
                    </Link>
                  ) : (
                    <span className="text-[13px] leading-snug text-text">{p.text}</span>
                  )}
                </div>
                {p.citations.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1 pl-3.5">
                    {p.citations.map((c) => (
                      <Tooltip key={`${c.chunkId}-${c.label}`} content={<span className="font-mono">“{c.quote}”</span>}>
                        <span className="rounded bg-surface-2 px-1 font-mono text-[10.5px] text-muted">{c.label}</span>
                      </Tooltip>
                    ))}
                  </div>
                )}
              </div>
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
  const v = await getHandoverPage(project.id, actor);
  if (!v) {
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
  const approved = v.mode === "approved" && !!v.version;
  const versionNo = approved ? v.version!.number : null;
  const canAck = can(actor.role, "acknowledge") && approved;
  const canAsk = can(actor.role, "ask_followups");
  const ackReason =
    actor.role === "INCOMING"
      ? "Acknowledge after the reviewer approves a version"
      : `Only ${h.to.name} (incoming) acknowledges sections`;
  const ackTargets = ["Overview", "7-day plan", "30-day plan", ...v.sections.map((s) => s.name)];
  const ackedCount = ackTargets.filter((s) => v.acknowledged.includes(s)).length;
  const ackFor = (section: string) => (
    <AcknowledgeButton
      slug={slug}
      version={versionNo}
      section={section}
      acknowledged={v.acknowledged.includes(section)}
      canAck={canAck}
      reason={ackReason}
    />
  );

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
            <span className="font-mono text-text">{v.counts.claims}</span> claims ·{" "}
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
          <Tooltip content="After compiling, the view is scanned for every canary string and hidden quote from sources this role may not see.">
            <span className="inline-flex items-center gap-1 text-xs text-subtle">
              <ShieldCheck className={cn("size-3.5", v.canary.hits === 0 ? "text-verified" : "text-conflicting")} />
              <span className="font-mono">{v.canary.hits}</span> leaks of <span className="font-mono">{v.canary.checked}</span> checked
            </span>
          </Tooltip>
        </div>
        <div className="text-right text-xs">
          {approved ? (
            <span className="text-verified" data-testid="approved-banner">
              v{v.version!.number} approved by {v.version!.approvedBy} · {fmtDateTime(v.version!.approvedAt)}
              {v.version!.approval?.override && <span className="ml-1.5 text-conflicting">with override</span>}
            </span>
          ) : (
            <Tooltip content="No version is approved yet. This preview is compiled live from the current draft; approval freezes it as v1.">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-primary" data-testid="draft-banner">
                Draft preview · not yet approved
              </span>
            </Tooltip>
          )}
        </div>
      </div>

      <div className="grid grid-cols-[200px_minmax(0,1fr)] gap-6">
        {/* TOC */}
        <nav aria-label="Sections" className="sticky top-28 h-fit space-y-0.5 text-[13px]">
          {["Overview", "7-day plan", "30-day plan"].map((s) => (
            <a key={s} href={`#${slugify(s)}`} className="flex items-center gap-2 rounded-md px-2 py-1 text-muted hover:bg-surface-2/60 hover:text-text">
              <span className={cn("size-1.5 shrink-0 rounded-full", v.acknowledged.includes(s) ? "bg-verified" : "bg-transparent ring-1 ring-subtle")} />
              <span className="flex-1 truncate">{s}</span>
            </a>
          ))}
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
            {approved ? `${ackedCount}/${ackTargets.length} acknowledged` : "Acknowledgements open after approval"}
          </p>
        </nav>

        <div className="min-w-0 space-y-4">
          <Card id="overview" className="scroll-mt-28">
            <CardHeader
              title="Overview"
              description={`Records as of ${v.asOfLabel} · written by ${v.writer === "model" ? "the model from allowed claims only" : "the deterministic template"}`}
              actions={ackFor("Overview")}
            />
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
            <Plan title="First 7 days" section="7-day plan" items={v.plan7} slug={slug} empty="Nothing urgent at your access level." ack={ackFor("7-day plan")} />
            <Plan title="Days 8–30" section="30-day plan" items={v.plan30} slug={slug} empty="No follow-on work at your access level." ack={ackFor("30-day plan")} />
          </div>

          {v.sections.map((s) => (
            <Card key={s.name} id={slugify(s.name)} className="scroll-mt-28" data-section={s.name}>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    {s.name}
                    <span className="font-mono text-[11px] font-normal text-subtle">{s.claims.length}</span>
                  </span>
                }
                actions={
                  <>
                    <FollowUpButton slug={slug} section={s.name} canAsk={canAsk} />
                    {ackFor(s.name)}
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
                          <Tooltip key={`${ct.chunkId}-${ct.label}`} content={<span className="font-mono">“{ct.quote}”</span>}>
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
                  <li className="flex items-center justify-between gap-2 px-4 py-2.5 text-xs text-subtle" data-testid="hidden-placeholder">
                    <span className="inline-flex items-center gap-2">
                      <Lock className="size-3" /> {s.hidden} claim{s.hidden === 1 ? "" : "s"} hidden — request access
                    </span>
                    {v.accessRequested.includes(s.name) ? (
                      <span className="text-muted">Requested from {h.from.name.split(" ")[0]}</span>
                    ) : canAsk ? (
                      <ActionButton action={requestAccess.bind(null, { slug, section: s.name })} variant="ghost">
                        Request access
                      </ActionButton>
                    ) : null}
                  </li>
                )}
              </ul>
            </Card>
          ))}

          <Card id="follow-ups">
            <CardHeader icon={<MessageSquareText />} title="Follow-ups" description="Questions asked after reading the handover; answers become testimony" />
            {v.followUps.length === 0 ? (
              <div className="flex items-center justify-between gap-4 px-4 py-4">
                <p className="text-[13px] text-muted">
                  No follow-ups yet. {canAsk ? "Ask Meera anything the records don't answer." : `${h.to.name} can ask Meera questions from any section.`}
                </p>
                <FollowUpButton slug={slug} canAsk={canAsk} label="Ask a question" />
              </div>
            ) : (
              <ul className="divide-y divide-border/70">
                {v.followUps.map((f) => (
                  <li key={f.id} className="px-4 py-3 text-[13px]" data-testid="follow-up">
                    <p className="text-text">{f.question}</p>
                    <p className="mt-0.5 text-xs text-subtle">
                      {f.askedBy} · {fmtDateTime(f.createdAt)} {f.section && `· ${f.section}`}
                      {!f.answer && " · waiting for Meera"}
                    </p>
                    {f.answer && (
                      <p className="mt-1.5 border-l-2 border-testimony/50 pl-2.5 text-muted">
                        {f.answer}
                        <span className="ml-1.5 font-mono text-[11px] text-subtle">testimony · {fmtDateTime(f.answeredAt)}</span>
                      </p>
                    )}
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
