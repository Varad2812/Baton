import Link from "next/link";
import { ArrowRight, CircleHelp, GitCompareArrows, ShieldAlert, Users } from "lucide-react";
import { getActor } from "@/lib/authz";
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
import { Constellation } from "@/components/dashboard/constellation";
import { cn } from "@/lib/utils";

export default async function DashboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [project, actor] = await Promise.all([getProject(slug), getActor()]);
  const d = await getDashboard(project.id, slug, actor);
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
            <span>Fest starts 30 Apr</span>
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

      {/* KPI row */}
      <section className="grid grid-cols-5 gap-3" aria-label="Key figures">
        <div className="flex flex-col rounded-lg border border-border bg-surface px-4 py-3">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>Claims</span>
            <span className="font-mono text-[11px] text-subtle">
              {d.rejected > 0 && `${d.rejected} rejected`}
              {d.hiddenCount > 0 && ` · ${d.hiddenCount} hidden`}
            </span>
          </div>
          <div className="mt-1.5 font-mono text-[26px] font-medium leading-none tabular-nums">{d.total}</div>
          <GradeBar grades={d.grades} className="mt-3" />
          <div className="mt-2 flex gap-2 font-mono text-[11px] text-subtle">
            {(["VERIFIED", "SINGLE_SOURCE", "INFERRED", "CONFLICTING", "MISSING"] as const).map((g) => (
              <span key={g} className="inline-flex items-center gap-1">
                <span className="size-1.5 rounded-full" style={{ background: GRADE_COLOR[g] }} />
                {d.grades[g]}
              </span>
            ))}
          </div>
        </div>
        <Stat
          label="Verified"
          value={d.verifiedPct}
          unit="%"
          spark={d.cumulative}
          sparkColor="var(--grade-verified)"
          footer={
            <span>
              <span className="font-mono text-muted">{d.grades.VERIFIED}</span> with ≥2 sources or an authoritative record
            </span>
          }
        />
        <Stat
          label="Open conflicts"
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
          label="Open gaps"
          value={d.openGaps}
          unit={`/ ${d.totalGaps}`}
          footer={
            <span>
              <span className="font-mono text-primary">{d.highPriorityGaps}</span> high priority · only Meera can answer
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
            <DecisionTrack entries={d.timeline} asOf={asOf} />
          </CardBody>
          {evolution.length === 0 ? (
            <p className="border-t border-border px-4 py-3 text-[13px] text-muted">
              No supersessions or contradictions visible at your access level
              {d.hiddenCount > 0 ? `; ${d.hiddenCount} claims cite sources you cannot see.` : "."}
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
              <span className="truncate">Queued for Meera: {d.singleOwnerGap.question}</span>
              <Link href={`${base}/interview#${d.singleOwnerGap.id}`} className="shrink-0 text-primary hover:underline">
                Interview
              </Link>
            </CardFooter>
          )}
        </Card>

        <Card className="flex flex-col">
          <CardHeader
            title="Evidence constellation"
            description={`${d.constellation.length} claims linked to the sources that back them`}
          />
          <div className="relative h-[300px] px-2">
            <Constellation nodes={d.constellation} />
          </div>
          <CardFooter>
            <span>Centre: corroborated · edge: single source</span>
            <span className="inline-flex items-center gap-1">
              <span className="size-1.5 rounded-full ring-1 ring-missing" /> missing
            </span>
          </CardFooter>
        </Card>

        <Card className="flex flex-col">
          <CardHeader
            title="Last pipeline run"
            description={
              d.run
                ? `${d.run.mode === "CACHED" ? "Cached result" : "Live"} · ${d.run.model} · ${fmtDate(d.run.startedAt)}`
                : "Not run yet"
            }
            actions={
              <Link href={`${base}/sources`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                Sources
              </Link>
            }
          />
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
