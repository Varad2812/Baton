import Link from "next/link";
import { ArrowRight, CircleHelp, GitCompareArrows, ShieldAlert, Users } from "lucide-react";
import { getActor, projectPersonas } from "@/lib/authz";
import { getProject } from "@/lib/views/project";
import { getDashboard } from "@/lib/views/dashboard";
import { ACCESS_LABEL, KIND_LABEL, fmtDate, fmtDateYear, fmtMs, GRADE_COLOR, shortArea } from "@/lib/views/format";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Tooltip } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { GradeChip, GradeDot } from "@/components/ui/grade-chip";
import { Timeline } from "@/components/ui/timeline";
import { buttonVariants } from "@/components/ui/button";
import { GradeBar } from "@/components/common/grade-bar";
import { AuditList } from "@/components/common/audit";
import { SourceIcon } from "@/components/common/source-icon";
import { DecisionTrack, shortChange } from "@/components/dashboard/decision-track";
import { ConstellationPanel } from "@/components/dashboard/constellation-panel";
import { EvidenceDrawer } from "@/components/ledger/evidence-drawer";
import { cn } from "@/lib/utils";
import { runSummary } from "@/lib/views/run-summary";
import { RunBadge } from "@/components/common/run-badge";
import { AnalysisSummary } from "@/components/dashboard/analysis-summary";
import { DemoBanner } from "@/components/dashboard/demo-banner";

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const [project, actor] = await Promise.all([getProject(slug), getActor(slug)]);
  const d = await getDashboard(project.id, slug, actor);
  const ppl = await projectPersonas(slug);
  const owner = ppl.meera.name.split(" ")[0];
  const runInfo = await runSummary(d.run);
  const base = `/p/${slug}`;
  const asOf = d.asOf;
  const stageMax = Math.max(...((d.run?.stages as { ms: number }[] | undefined) ?? [{ ms: 1 }]).map((s) => s.ms));
  const evolution = d.timeline.filter((t) => t.kind !== "decision").sort((a, b) => b.date.getTime() - a.date.getTime());

  return (
    <>
      <PageHeader
        title="Command centre"
        description={project.description}
        meta={
          <>
            <span>
              Records {fmtDate(d.firstRecord)} – {fmtDateYear(d.asOf)}
            </span>
            <span className="text-border">·</span>
            <span>Handover {owner} → {ppl.arjun.name.split(" ")[0]}</span>
            <span className="text-border">·</span>
            <span>
              Viewing as <span className="text-muted">{actor.name}</span> ({actor.role.toLowerCase()})
            </span>
          </>
        }
        actions={
          <>
            <Link href={`${base}/ledger`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Open ledger
            </Link>
            <Link href={`${base}/handover`} className={buttonVariants({ size: "sm" })}>
              View handover
              <ArrowRight className="size-3.5" />
            </Link>
          </>
        }
      />

      {slug === "festflow" && <DemoBanner />}

      <AnalysisSummary
        d={d}
        slug={slug}
        people={{ owner, successor: ppl.arjun.name.split(" ")[0] }}
      />


      {/* KPI row */}
      <section className="mt-3 grid grid-cols-4 gap-3" aria-label="Key figures" data-tour="kpis">
        <Stat
          label="Confirmed"
          help="Facts backed by an exact quote in 2+ independent sources (or one authoritative record). The share of all facts."
          value={d.verifiedPct}
          unit="%"
          spark={d.cumulative}
          sparkColor="var(--grade-verified)"
          footer={
            <span>
              <span className="font-mono text-muted">{d.grades.VERIFIED}</span> facts with 2+ sources or an authoritative record
            </span>
          }
        />
        <Stat
          label="Open conflicts"
          help="Places where two sources disagree and nobody has decided which is right yet."
          value={d.openConflicts}
          unit={`/ ${d.totalConflicts}`}
          footer={
            <span>
              <span className="font-mono text-muted">{d.timeline.filter((t) => t.kind === "supersedes").length}</span>{" "}
              supersessions shown as evolution
            </span>
          }
        />
        <Stat
          label="Open questions"
          help="Things the records cannot answer. Only the person leaving can fill these in."
          value={d.openGaps}
          unit={`/ ${d.totalGaps}`}
          footer={
            <span>
              <span className="font-mono text-primary">{d.highPriorityGaps}</span> high priority · only {owner} can answer
            </span>
          }
        />
        <Stat
          label="Handover readiness"
          value={d.readiness}
          unit="/ 100"
          info={
            <Tooltip
              content={
                <div className="space-y-1">
                  <p className="font-medium">How readiness is scored</p>
                  <ReadinessRow label="Verified share" weight={40} v={d.readinessParts.verified} />
                  <ReadinessRow label="Conflicts resolved" weight={20} v={d.readinessParts.conflicts} />
                  <ReadinessRow label="Checklist coverage" weight={25} v={d.readinessParts.checklist} />
                  <ReadinessRow label="Gap questions answered" weight={15} v={d.readinessParts.gaps} />
                </div>
              }
            >
              <CircleHelp className="size-3.5 text-subtle" aria-label="How readiness is scored" />
            </Tooltip>
          }
          footer={
            <div className="h-1 w-full overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-primary" style={{ width: `${d.readiness}%` }} />
            </div>
          }
        />
      </section>

      {/* Timeline + attention */}
      <section className="mt-3 grid grid-cols-3 gap-3">
        <Card className="col-span-2">
          <CardHeader
            title="Decision timeline"
            icon={<GitCompareArrows />}
            description="Arrows above the line replaced an earlier decision. Dashed arcs below still disagree."
            actions={
              <Link href={`${base}/conflicts`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                Conflicts
              </Link>
            }
          />
          <CardBody className="pb-2 pt-3">
            <DecisionTrack
              entries={d.timeline}
              asOf={asOf}
              firstRecord={d.firstRecord}
              marker={slug === "festflow" ? { label: "fest", from: new Date("2026-04-30T00:00:00+05:30"), to: new Date("2026-05-03T00:00:00+05:30") } : undefined}
            />
          </CardBody>
          {evolution.length === 0 ? (
            <p className="border-t border-border px-4 py-3 text-[13px] text-muted">
              No supersessions or contradictions visible at your access level
              {d.hiddenCount > 0 ? `; ${d.hiddenCount} facts cite sources you cannot see.` : "."}
            </p>
          ) : (
          <div className="grid grid-cols-2 gap-x-6 border-t border-border px-4 py-3">
            <Timeline
              items={evolution.slice(0, 6).filter((_, i) => i % 2 === 0).map(toItem(base))}
            />
            <Timeline
              items={evolution.slice(0, 6).filter((_, i) => i % 2 === 1).map(toItem(base))}
            />
          </div>
          )}
        </Card>

        <Card className="flex flex-col">
          <CardHeader
            title="Needs attention"
            icon={<ShieldAlert />}
            actions={<Badge variant="count">{d.attention.length}</Badge>}
          />
          <ul className="max-h-[360px] flex-1 divide-y divide-border/70 overflow-y-auto">
            {d.attention.slice(0, 9).map((a) => (
              <li key={a.id} className="flex items-start gap-2.5 px-4 py-2.5">
                <GradeDot grade={a.grade} className="mt-1.5" />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-[13px] leading-snug text-text">{a.title}</p>
                  <p className="truncate text-xs text-subtle">{a.detail}</p>
                </div>
                <Link href={a.href} className={buttonVariants({ variant: "outline", size: "sm", className: "h-6 px-2" })}>
                  {a.action}
                </Link>
              </li>
            ))}
            {d.attention.length === 0 && (
              <li className="px-4 py-6 text-[13px] text-muted">Nothing open at your access level.</li>
            )}
          </ul>
          {d.attention.length > 9 && (
            <CardFooter>
              <span>{d.attention.length - 9} more</span>
              <Link href={`${base}/ledger?grade=MISSING`} className="text-muted hover:text-text">
                See all in ledger
              </Link>
            </CardFooter>
          )}
        </Card>
      </section>

      {/* Risk, constellation, run */}
      <section className="mt-3 grid grid-cols-3 gap-3">
        <Card className="flex flex-col">
          <CardHeader
            title="Knowledge at risk"
            icon={<Users />}
            description="Bus factor per area, from commit authorship"
          />
          {d.ownership.length === 0 && (
            <div className="flex flex-1 flex-col items-start justify-center gap-2 px-4 py-6" data-testid="ownership-empty">
              <p className="text-[13px] text-muted">
                No commit history in the connected sources, so ownership by area cannot be measured.
              </p>
              <p className="text-xs text-subtle">Import a GitHub repo to see who holds each area, or ask {owner} who owns what.</p>
              <Link href={`${base}/sources`} className={buttonVariants({ variant: "outline", size: "sm" })}>Connect a repo</Link>
            </div>
          )}
          <ul className="flex-1 divide-y divide-border/70">
            {d.ownership.map((o) => (
              <li key={o.area} className="px-4 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[12px] text-text">{shortArea(o.area)}</span>
                  <span
                    className={cn(
                      "rounded px-1.5 font-mono text-[11px]",
                      o.busFactor === 1 ? "bg-conflicting/12 text-conflicting" : "bg-surface-2 text-muted",
                    )}
                  >
                    bus factor {o.busFactor}
                  </span>
                </div>
                <div className="mt-1.5 flex h-1.5 gap-px overflow-hidden rounded-sm bg-surface-2">
                  <span
                    style={{ width: `${o.top.share * 100}%` }}
                    className={o.top.share >= 0.9 ? "bg-conflicting" : o.top.share >= 0.6 ? "bg-primary" : "bg-single"}
                  />
                  {o.others.map((x) => (
                    <span key={x.name} style={{ width: `${(x.commits / o.commits) * 100}%` }} className="bg-muted/40" />
                  ))}
                </div>
                <p className="mt-1 text-xs text-subtle">
                  <span className="text-muted">{Math.round(o.top.share * 100)}% {o.top.name.split(" ")[0]}</span>, {o.top.commits}{" "}
                  of {o.commits} commits
                  {o.others.length > 0 && ` · ${o.others.map((x) => `${x.name.split(" ")[0]} ${x.commits}`).join(", ")}`}
                </p>
              </li>
            ))}
          </ul>
          {d.singleOwnerGap && (
            <CardFooter>
              <span className="truncate">Queued for {owner}: {d.singleOwnerGap.question}</span>
              <Link href={`${base}/interview#${d.singleOwnerGap.id}`} className="shrink-0 text-primary hover:underline">
                Interview
              </Link>
            </CardFooter>
          )}
        </Card>

        <Card className="flex flex-col">
          <CardHeader
            title="Evidence constellation"
            description={`${d.constellation.nodes.filter((n) => n.type === "claim").length} facts linked to ${d.constellation.nodes.filter((n) => n.type === "source").length} sources · click a fact for its evidence`}
          />
          <div className="relative h-[300px] px-2">
            <ConstellationPanel nodes={d.constellation.nodes} edges={d.constellation.edges} hiddenCount={d.constellation.hiddenCount} />
          </div>
          <CardFooter>
            <span>Cubes: sources · spheres: facts by grade · red dashed: contradicts</span>
            {d.constellation.hiddenCount > 0 && <span className="font-mono">{d.constellation.hiddenCount} hidden</span>}
          </CardFooter>
        </Card>

        <Card className="flex flex-col">
          <CardHeader
            title="Last pipeline run"
            description={d.run ? fmtDate(d.run.startedAt) : "Not run yet"}
            actions={
              <Link href={`${base}/sources`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                Sources
              </Link>
            }
          />
          {runInfo && d.run && (
            <div className="flex flex-wrap items-center gap-1.5 border-b border-border/70 px-4 py-2">
              <RunBadge {...runInfo} className="max-w-full whitespace-normal" />
            </div>
          )}
          <ol className="flex-1 px-4 py-2">
            {((d.run?.stages ?? []) as { stage: string; ms: number; counts: Record<string, number> }[]).map((s, i) => (
              <li key={s.stage} className="grid grid-cols-[16px_76px_1fr_72px] items-center gap-2 py-[5px] text-xs">
                <span className="font-mono text-[10px] text-subtle">{i + 1}</span>
                <span className="capitalize text-text">{s.stage}</span>
                <span className="truncate text-subtle">{describeCounts(s.counts)}</span>
                <span className="flex items-center justify-end gap-1.5">
                  <span className="h-1 rounded-full bg-verified/60" style={{ width: Math.max(2, (s.ms / stageMax) * 28) }} />
                  <span className="whitespace-nowrap font-mono text-[11px] text-muted">{fmtMs(s.ms)}</span>
                </span>
              </li>
            ))}
          </ol>
          {d.run?.mode === "CACHED" && (
            <CardFooter>
              <span>Served from the committed cache; no API key needed.</span>
            </CardFooter>
          )}
        </Card>
      </section>

      {/* Sources + activity */}
      <section className="mt-3 grid grid-cols-3 gap-3">
        <Card>
          <CardHeader
            title="Sources"
            description={`${d.sources.total} sources · ${d.sources.chunks} chunks`}
            actions={
              <Link href={`${base}/sources`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                Manage
              </Link>
            }
          />
          <ul className="px-4 py-2">
            {d.sources.byKind.map(([kind, v]) => (
              <li key={kind} className="flex items-center gap-2 py-1 text-[13px]">
                <SourceIcon kind={kind} />
                <span className="flex-1 text-muted">{KIND_LABEL[kind]}</span>
                <span className="font-mono text-xs text-text">{v.sources}</span>
                <span className="w-16 text-right font-mono text-[11px] text-subtle">{v.chunks} chunks</span>
              </li>
            ))}
          </ul>
          <CardFooter>
            {d.sources.byAccess.map(([a, n]) => (
              <span key={a} className={a === "RESTRICTED" ? "text-conflicting" : undefined}>
                {ACCESS_LABEL[a]} <span className="font-mono">{n}</span>
              </span>
            ))}
          </CardFooter>
        </Card>

        <Card className="col-span-2">
          <CardHeader
            title="Recent activity"
            description="Every mutation writes an audit row"
            actions={
              <Link href={`${base}/trust#audit`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                Audit log
              </Link>
            }
          />
          <AuditList rows={d.audit} compact />
        </Card>
      </section>
      <EvidenceDrawer slug={slug} projectId={project.id} actor={actor} visible={d.visibleClaims} claimId={typeof sp.claim === "string" ? sp.claim : undefined} />
    </>
  );
}

function ReadinessRow({ label, weight, v }: { label: string; weight: number; v: number }) {
  return (
    <div className="flex justify-between gap-4 font-mono text-[11px]">
      <span className="font-sans text-muted">
        {label} × {weight}%
      </span>
      <span>
        {Math.round(v * 100)}% → {Math.round(v * weight)}
      </span>
    </div>
  );
}

function describeCounts(c: Record<string, number>): string {
  return Object.entries(c)
    .slice(0, 3)
    .map(([k, v]) => `${v} ${k.toLowerCase().replace("_", " ")}`)
    .join(" · ");
}

function toItem(base: string) {
  return (t: import("@/lib/views/dashboard").TimelineEntry) => ({
    id: t.id,
    date: fmtDate(t.date),
    color: t.kind === "conflict" ? "var(--grade-conflicting)" : "var(--grade-verified)",
    from: t.kind === "supersedes" ? t.fromTitle : undefined,
    title: (
      <Link href={`${base}/ledger?claim=${t.claimId}`} className="hover:underline">
        {t.kind === "supersedes" ? shortChange(t.fromTitle, t.title, t.id) : t.title}
      </Link>
    ),
    meta: t.kind === "conflict" ? `vs ${t.fromTitle}` : t.reason,
    aside: <GradeChip grade={t.grade} compact />,
  });
}
