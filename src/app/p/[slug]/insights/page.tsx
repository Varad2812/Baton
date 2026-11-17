import Link from "next/link";
import { GitCompareArrows, ShieldAlert, Users } from "lucide-react";
import { baseId, isDemoSlug } from "@/lib/demo";
import { getActor, projectPersonas } from "@/lib/authz";
import { getProject } from "@/lib/views/project";
import { getDashboard, type TimelineEntry } from "@/lib/views/dashboard";
import { ACCESS_LABEL, KIND_LABEL, fmtDate, fmtMs, shortArea } from "@/lib/views/format";
import { runSummary } from "@/lib/views/run-summary";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GradeChip, GradeDot } from "@/components/ui/grade-chip";
import { Timeline } from "@/components/ui/timeline";
import { buttonVariants } from "@/components/ui/button";
import { LinkTabs, tabFrom } from "@/components/ui/link-tabs";
import { AuditList } from "@/components/common/audit";
import { SourceIcon } from "@/components/common/source-icon";
import { RunBadge } from "@/components/common/run-badge";
import { DecisionTrack, shortChange } from "@/components/dashboard/decision-track";
import { ConstellationPanel } from "@/components/dashboard/constellation-panel";
import { EvidenceDrawer } from "@/components/ledger/evidence-drawer";
import { cn } from "@/lib/utils";

const TABS = ["timeline", "map", "activity"] as const;

/** The deeper views that used to crowd the dashboard: how decisions evolved, the evidence map, activity. */
export default async function InsightsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const tab = tabFrom(sp.tab, TABS);
  const [project, actor, ppl] = await Promise.all([getProject(slug), getActor(slug), projectPersonas(slug)]);
  const d = await getDashboard(project.id, slug, actor);
  const owner = ppl.meera.name.split(" ")[0];
  const base = `/p/${slug}`;
  const evolution = d.timeline.filter((t) => t.kind !== "decision").sort((a, b) => b.date.getTime() - a.date.getTime());
  const facts = d.constellation.nodes.filter((n) => n.type === "claim").length;
  const sourcesN = d.constellation.nodes.filter((n) => n.type === "source").length;

  return (
    <>
      <PageHeader title="Insights" description="How decisions changed over time, how facts link to their sources, and what happened recently." />
      <LinkTabs
        path={`${base}/insights`}
        current={tab}
        label="Insights views"
        items={[
          { value: "timeline", label: "Timeline", count: evolution.length },
          { value: "map", label: "Evidence map 3D" },
          { value: "activity", label: "Activity", count: d.audit.length },
        ]}
      />

      {tab === "timeline" && (
        <div className="space-y-4">
          <Card>
            <CardHeader title="Decision timeline" icon={<GitCompareArrows />} description="Arrows above the line replaced an earlier decision. Dashed arcs below still disagree." />
            <CardBody className="pb-2 pt-3">
              <DecisionTrack
                entries={d.timeline}
                asOf={d.asOf}
                firstRecord={d.firstRecord}
                marker={isDemoSlug(slug) ? { label: "fest", from: new Date("2026-04-30T00:00:00+05:30"), to: new Date("2026-05-03T00:00:00+05:30") } : undefined}
              />
            </CardBody>
          </Card>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="What changed" description="Newest first: replaced decisions and open disagreements" />
              {evolution.length === 0 ? (
                <p className="px-4 py-4 text-[13px] text-muted">
                  No supersessions or contradictions visible at your access level{d.hiddenCount > 0 ? `; ${d.hiddenCount} facts cite sources you cannot see.` : "."}
                </p>
              ) : (
                <div className="px-4 py-3">
                  <Timeline items={evolution.slice(0, 8).map(toItem(base))} />
                </div>
              )}
            </Card>
            <Card className="flex flex-col">
              <CardHeader title="Needs attention" icon={<ShieldAlert />} actions={<Badge variant="count">{d.attention.length}</Badge>} />
              <ul className="max-h-[420px] flex-1 divide-y divide-border/70 overflow-y-auto">
                {d.attention.slice(0, 12).map((a) => (
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
                {d.attention.length === 0 && <li className="px-4 py-6 text-[13px] text-muted">Nothing open at your access level.</li>}
              </ul>
              {d.attention.length > 12 && (
                <CardFooter>
                  <span>{d.attention.length - 12} more</span>
                  <Link href={`${base}/ledger?grade=MISSING`} className="text-muted hover:text-text">
                    See all in Facts
                  </Link>
                </CardFooter>
              )}
            </Card>
          </div>
        </div>
      )}

      {tab === "map" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="flex flex-col">
            <CardHeader title="Evidence map" description={`${facts} facts linked to ${sourcesN} sources · click a fact for its evidence`} />
            <div className="relative flex-1 px-2">
              <ConstellationPanel base={base} className="h-[420px] lg:h-[560px]" nodes={d.constellation.nodes} edges={d.constellation.edges} hiddenCount={d.constellation.hiddenCount} />
            </div>
            <CardFooter>
              <span>Cubes: sources · spheres: facts by grade · red dashed: contradicts</span>
              {d.constellation.hiddenCount > 0 && <span className="font-mono">{d.constellation.hiddenCount} hidden</span>}
            </CardFooter>
          </Card>
          <div className="space-y-4">
            <Card>
              <CardHeader title="Sources" description={`${d.sources.total} sources · ${d.sources.chunks} chunks`} actions={<Link href={`${base}/sources`} className={buttonVariants({ variant: "ghost", size: "sm" })}>Manage</Link>} />
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
            <Card className="flex flex-col">
              <CardHeader title="Who holds each area" icon={<Users />} description="Bus factor per area, from commit authorship" />
              {d.ownership.length === 0 ? (
                <div className="flex flex-col items-start gap-2 px-4 py-4" data-testid="ownership-empty">
                  <p className="text-[13px] text-muted">No commit history in the connected sources, so ownership by area cannot be measured.</p>
                  <p className="text-xs text-subtle">Import a GitHub repo to see who holds each area, or ask {owner} who owns what.</p>
                  <Link href={`${base}/sources/add?method=github`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                    Connect a repo
                  </Link>
                </div>
              ) : (
                <ul className="divide-y divide-border/70">
                  {d.ownership.map((o) => (
                    <li key={o.area} className="px-4 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-[12px] text-text">{shortArea(o.area)}</span>
                        <span className={cn("shrink-0 rounded px-1.5 font-mono text-[11px]", o.busFactor === 1 ? "bg-conflicting/12 text-conflicting" : "bg-surface-2 text-muted")}>bus factor {o.busFactor}</span>
                      </div>
                      <div className="mt-1.5 flex h-1.5 gap-px overflow-hidden rounded-sm bg-surface-2">
                        <span style={{ width: `${o.top.share * 100}%` }} className={o.top.share >= 0.9 ? "bg-conflicting" : o.top.share >= 0.6 ? "bg-primary" : "bg-single"} />
                        {o.others.map((x) => (
                          <span key={x.name} style={{ width: `${(x.commits / o.commits) * 100}%` }} className="bg-muted/40" />
                        ))}
                      </div>
                      <p className="mt-1 text-xs text-subtle">
                        <span className="text-muted">
                          {Math.round(o.top.share * 100)}% {o.top.name.split(" ")[0]}
                        </span>
                        , {o.top.commits} of {o.commits} commits
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              {d.singleOwnerGap && (
                <CardFooter>
                  <span className="truncate">Queued for {owner}: {d.singleOwnerGap.question}</span>
                  <Link href={`${base}/interview#${baseId(d.singleOwnerGap.id)}`} className="shrink-0 text-primary hover:underline">
                    Interview
                  </Link>
                </CardFooter>
              )}
            </Card>
          </div>
        </div>
      )}

      {tab === "activity" && <ActivityTab d={d} base={base} />}

      <EvidenceDrawer slug={slug} projectId={project.id} actor={actor} visible={d.visibleClaims} claimId={typeof sp.claim === "string" ? sp.claim : undefined} />
    </>
  );
}

async function ActivityTab({ d, base }: { d: Awaited<ReturnType<typeof getDashboard>>; base: string }) {
  const runInfo = await runSummary(d.run);
  const stages = (d.run?.stages ?? []) as { stage: string; ms: number; counts: Record<string, number> }[];
  const stageMax = Math.max(1, ...stages.map((s) => s.ms));
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card>
        <CardHeader title="Recent activity" description="Every change writes an audit row" actions={<Link href={`${base}/trust?tab=audit`} className={buttonVariants({ variant: "ghost", size: "sm" })}>Full audit log</Link>} />
        <AuditList rows={d.audit} compact />
      </Card>
      <Card className="flex flex-col self-start">
        <CardHeader title="Last pipeline run" description={d.run ? fmtDate(d.run.startedAt) : "Not run yet"} actions={<Link href={`${base}/sources?tab=runs`} className={buttonVariants({ variant: "ghost", size: "sm" })}>Pipeline</Link>} />
        {runInfo && d.run && (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-border/70 px-4 py-2">
            <RunBadge {...runInfo} className="max-w-full whitespace-normal" />
          </div>
        )}
        <ol className="px-4 py-2">
          {stages.map((s, i) => (
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
          {stages.length === 0 && <li className="py-3 text-[13px] text-muted">The pipeline has not run yet. Run it from Sources.</li>}
        </ol>
        {d.run?.mode === "CACHED" && (
          <CardFooter>
            <span>Served from the committed cache; no API key needed.</span>
          </CardFooter>
        )}
      </Card>
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
  return (t: TimelineEntry) => ({
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
