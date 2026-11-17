import Link from "next/link";
import { CalendarClock, FileText, Lock, MessageSquareText, ShieldCheck } from "lucide-react";
import { can, getActor } from "@/lib/authz";
import { getProject } from "@/lib/views/project";
import { getHandoverPage, type PlanItem } from "@/lib/views/handover";
import { fmtDate, fmtDateTime, ROLE_LABEL } from "@/lib/views/format";
import { RequestAccess } from "@/components/handover/request-access";
import { PageHeader } from "@/components/shell/page-header";
import { ShareMenu } from "@/components/handover/share-menu";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GradeChip } from "@/components/ui/grade-chip";
import { Avatar } from "@/components/ui/avatar";
import { Tooltip } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { AcknowledgeButton, FollowUpButton } from "@/components/handover/handover-actions";
import { PrintButton } from "@/components/handover/print-button";
import { ExportButtons } from "@/components/handover/export-buttons";
import { cn } from "@/lib/utils";
import { AskBox } from "@/components/ask/ask-box";
import { ChangeList, ChangesBanner } from "@/components/changes/changes-banner";
import { changesBetween, markHandoverViewed, pendingChanges } from "@/lib/sync/service";
import { projectPersonas } from "@/lib/authz";
import { suggestionsFor } from "@/lib/ask/suggest";
import type { AskDoc } from "@/lib/ask/types";

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
        className="[&_h2]:font-serif [&_h2]:text-[17px]"
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
        <ol className="relative px-4 py-2 before:absolute before:bottom-4 before:left-[25px] before:top-4 before:w-px before:bg-border">
          {items.map((p) => (
            <li key={p.id} className="relative grid grid-cols-[20px_minmax(0,1fr)] gap-2.5 py-2">
              <span className="relative z-10 mt-0.5 size-4 rounded-[4px] border border-subtle bg-surface" aria-hidden />
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
  const [project, actor] = await Promise.all([getProject(slug), getActor(slug)]);
  const v = await getHandoverPage(project.id, actor);
  const current = v?.version?.number ?? 0;
  const [pending, sinceLast, ppl] = await Promise.all([
    pendingChanges(actor, project.id),
    current >= 2 ? changesBetween(actor, project.id, current - 1, current) : Promise.resolve(null),
    projectPersonas(slug),
    v?.mode === "approved" ? markHandoverViewed(actor, project.id, current) : Promise.resolve(),
  ]);
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
  const firstHidden = v.sections.find((s) => s.hidden > 0)?.name;
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
        title={`${h.to.name.split(" ")[0]}'s handover`}
        description={`The approved plan ${h.to.name.split(" ")[0]} works from. Every line cites its source; click a superscript tag to see the quote.`}
        className="print:hidden"
        actions={
          <ShareMenu>
            <Link href={`/p/${slug}/handover/receipt`} data-print-hide className={buttonVariants({ variant: "outline", size: "sm" })}>
              <ShieldCheck className="size-3.5" />
              Sign-off receipt
            </Link>
            <ExportButtons
              slug={slug}
              canShare={approved && actor.role !== "OBSERVER"}
              shareReason={!approved ? "Approve a version first; only approved handovers can be shared." : actor.role === "OBSERVER" ? "Observers cannot share the handover." : null}
            />
            <PrintButton />
          </ShareMenu>
        }
      />

      <ChangesBanner changes={pending} slug={slug} actor={actor} reviewer={ppl.rao.name} />

      {sinceLast && sinceLast.total > 0 && (
        <Card className="mb-4 print:break-inside-avoid" data-testid="what-changed">
          <CardHeader
            className="[&_h2]:font-serif [&_h2]:text-[17px]"
            title={`What changed since v${current - 1}`}
            description={`Approved in v${current}. Read this first if you already know v${current - 1}.`}
          />
          <ChangeList changes={sinceLast} slug={slug} />
        </Card>
      )}

      {/* Ask the handover: questions answered only from this document's sources */}
      <div className="mb-4 print:hidden" data-testid="handover-ask">
        <AskBox
          slug={slug}
          successor={h.to.name.split(" ")[0]}
          compact
          suggestions={suggestionsFor(v.sections.flatMap((s) => s.claims.map((c) => ({ title: c.title, grade: c.grade, section: s.name }) as AskDoc)))}
        />
      </div>

      {/* Cover */}
      <section className="mb-4 rounded-lg border border-border bg-surface px-6 py-5 print:border-0 print:px-0" aria-label="Cover">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.14em] text-subtle">Project handover · {project.name}</div>
            <h2 className="mt-1.5 font-serif text-[30px] font-semibold leading-tight tracking-tight text-text">
              {h.from.name} <span className="text-subtle">→</span> {h.to.name}
            </h2>
            <p className="mt-1.5 text-[13px] text-muted">
              Reviewed by {h.reviewer.name} · {approved ? `version ${versionNo}` : "draft"} ·{" "}
              {approved ? fmtDate(v.version!.approvedAt) : `records as of ${v.asOfLabel}`}
            </p>
          </div>
          {approved ? (
            <div data-testid="approved-banner" className="shrink-0 rotate-[-2deg] rounded-md border-2 border-verified/70 px-3 py-2 text-center text-verified">
              <span className="sr-only">v{v.version!.number} approved by {v.version!.approvedBy}</span>
              <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em]">Approved · v{v.version!.number}</div>
              <div className="mt-0.5 text-xs">by {v.version!.approvedBy}</div>
              <div className="font-mono text-[11px] text-verified/80">{fmtDateTime(v.version!.approvedAt)}</div>
              {v.version!.approval?.override && <div className="mt-0.5 text-[11px] text-conflicting">with override</div>}
            </div>
          ) : (
            <Tooltip content="No version is approved yet. This is compiled live from the current draft; approval freezes it as v1.">
              <div data-testid="draft-banner" className="shrink-0 rotate-[-2deg] rounded-md border-2 border-dashed border-primary/70 px-3 py-2 text-center text-primary">
                <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em]">Draft</div>
                <div className="text-xs">awaiting approval</div>
              </div>
            </Tooltip>
          )}
        </div>
      </section>

      {/* Role-compiled banner */}
      <div className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 print:hidden rounded-lg border border-border bg-surface px-4 py-3">
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
            <span className="font-mono text-text">{v.counts.claims}</span> facts ·{" "}
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
        <span />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
        {/* TOC */}
        <nav aria-label="Sections" className="h-fit lg:sticky lg:top-28 print:static space-y-0.5 text-[13px]">
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
              className="[&_h2]:font-serif [&_h2]:text-[17px]"
              title="Overview"
              description={`Records as of ${v.asOfLabel} · written by ${v.writer === "model" ? "the model from allowed facts only" : "the deterministic template"}`}
              actions={ackFor("Overview")}
            />
            <div className="grid grid-cols-1 gap-6 px-4 py-4 md:grid-cols-[minmax(0,1fr)_220px]">
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

          <div id="plan" className="grid scroll-mt-28 grid-cols-1 gap-4 md:grid-cols-2">
            <Plan title="First 7 days" section="7-day plan" items={v.plan7} slug={slug} empty="Nothing urgent at your access level." ack={ackFor("7-day plan")} />
            <Plan title="Days 8–30" section="30-day plan" items={v.plan30} slug={slug} empty="No follow-on work at your access level." ack={ackFor("30-day plan")} />
          </div>

          {v.sections.map((s) => (
            <Card key={s.name} id={slugify(s.name)} className="scroll-mt-28" data-section={s.name}>
              <CardHeader
                className="[&_h2]:font-serif [&_h2]:text-[17px]"
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
                              className="ml-0.5 align-super font-mono text-[9.5px] not-italic leading-none text-primary hover:underline"
                            >
                              <sup className="rounded bg-surface-2 px-1 py-px">{ct.label}</sup>
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
                  <li
                    className="flex items-center justify-between gap-2 px-4 py-2.5 text-xs text-subtle"
                    data-testid="hidden-placeholder"
                    data-tour={s.name === firstHidden ? "hidden-claim" : undefined}
                  >
                    <span className="inline-flex items-center gap-2">
                      <Lock className="size-3" /> {s.hidden} fact{s.hidden === 1 ? "" : "s"} hidden — request access
                    </span>
                    {v.accessRequested.includes(s.name) ? (
                      <span className="text-muted">Requested from {h.from.name.split(" ")[0]}</span>
                    ) : canAsk ? (
                      <RequestAccess slug={slug} section={s.name} variant="ghost" />
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
                  No follow-ups yet. {canAsk ? `Ask ${h.from.name.split(" ")[0]} anything the records don't answer.` : `${h.to.name} can ask ${h.from.name.split(" ")[0]} questions from any section.`}
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
                      {!f.answer && ` · waiting for ${h.from.name.split(" ")[0]}`}
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
