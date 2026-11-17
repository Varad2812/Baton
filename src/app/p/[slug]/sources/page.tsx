import Link from "next/link";
import { BadgeCheck, Lock, Plus } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import type { SourceKind } from "@/generated/prisma/enums";
import { allowedAccess, can, canSeeChunk, getActor, projectPersonas } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { getProject } from "@/lib/views/project";
import { fmtDate, KIND_LABEL } from "@/lib/views/format";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { ColumnsTable } from "@/components/sources/columns-table";
import { LinkTabs, tabFrom } from "@/components/ui/link-tabs";
import { Button, buttonVariants } from "@/components/ui/button";
import { AccessChip } from "@/components/ui/access-chip";
import { Badge } from "@/components/ui/badge";
import { SourceIcon } from "@/components/common/source-icon";
import { PipelineStepper } from "@/components/sources/pipeline-stepper";
import { GrantToggle } from "@/components/sources/grant-toggle";
import { AccessSelect } from "@/components/sources/access-select";
import { geminiModel } from "@/lib/llm";
import { runSummary } from "@/lib/views/run-summary";
import { SyncPanel } from "@/components/sources/sync-panel";
import { isDemoSlug } from "@/lib/demo";

const TABS = ["all", "current", "runs"] as const;

/** A run still in progress (started within the last 5 minutes), which the stepper follows after a refresh. */
function activeRunId(run: { id: string; status: string; startedAt: Date } | null): string | null {
  return run?.status === "RUNNING" && run.startedAt.getTime() > Date.now() - 5 * 60_000 ? run.id : null;
}

export default async function SourcesPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const [project, actor, ppl] = await Promise.all([getProject(slug), getActor(slug), projectPersonas(slug)]);
  const tab = tabFrom(sp.tab, TABS);
  const [sources, run, allowed, evidence, syncStates, handover] = await Promise.all([
    prisma.source.findMany({
      where: { projectId: project.id },
      include: {
        chunks: { select: { id: true, access: true, sourceId: true, _count: { select: { redactions: true } } } },
      },
      orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
    }),
    prisma.pipelineRun.findFirst({ where: { projectId: project.id }, orderBy: { startedAt: "desc" } }),
    allowedAccess(actor.role, project.id),
    prisma.evidence.groupBy({ by: ["chunkId"], where: { claim: { projectId: project.id } }, _count: true }),
    prisma.syncState.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "asc" } }),
    prisma.handover.findFirst({ where: { projectId: project.id }, select: { currentVersion: true } }),
  ]);
  const citedByChunk = new Map(evidence.map((e) => [e.chunkId, e._count]));
  const canLabel = can(actor.role, "label_sources");
  const canConnect = can(actor.role, "connect_sources");
  const owner = ppl.meera.name.split(" ")[0];
  const base = `/p/${slug}`;
  const kinds = new Map<SourceKind, number>();
  for (const s of sources) kinds.set(s.kind, (kinds.get(s.kind) ?? 0) + 1);
  const chunkTotal = sources.reduce((n, s) => n + s.chunks.length, 0);
  const redactionTotal = sources.reduce((n, s) => n + s.chunks.reduce((m, c) => m + c._count.redactions, 0), 0);
  const runInfo = await runSummary(run);
  const stages = (run?.stages ?? []) as { stage: string; status: string; ms: number; counts: Record<string, number> }[];

  const rows = sources.map((s) => {
    const visible = s.chunks.length === 0 || s.chunks.some((c) => canSeeChunk(allowed, c));
    const cited = s.chunks.reduce((n, c) => n + (citedByChunk.get(c.id) ?? 0), 0);
    const red = s.chunks.reduce((n, c) => n + c._count.redactions, 0);
    return {
      id: s.id,
      sort: {
        title: s.title,
        kind: s.kind,
        access: s.access,
        chunks: s.chunks.length,
        cited,
        author: s.author,
        date: s.createdAt.getTime(),
      },
      cells: {
        title: (
          <div className="flex min-w-0 items-center gap-2">
            <SourceIcon kind={s.kind} />
            {visible ? (
              <span className="truncate text-text" title={s.title}>{s.title}</span>
            ) : (
              <span className="inline-flex items-center gap-1.5 truncate text-subtle">
                <Lock className="size-3" /> Restricted source
              </span>
            )}
            {s.authoritative && (
              <Tooltip content="Authoritative: a merged PR or approved notes. One quote from it is enough to confirm a fact.">
                <BadgeCheck className="size-3.5 shrink-0 text-verified" aria-label="authoritative" />
              </Tooltip>
            )}
            {red > 0 && (
              <Badge variant="outline" size="sm" className="font-mono">
                {red} redacted
              </Badge>
            )}
          </div>
        ),
        access: canLabel ? (
          <AccessSelect slug={slug} sourceId={s.id} access={s.access} title={s.title} isTestimony={s.kind === "TESTIMONY"} />
        ) : (
          <AccessChip access={s.access} />
        ),
        chunks: <span className="font-mono text-xs text-muted">{s.chunks.length}</span>,
        cited: (
          <span className={cited ? "font-mono text-xs text-text" : "font-mono text-xs text-subtle"}>{cited}</span>
        ),
        author: <span className="truncate text-xs text-muted">{visible ? (s.author ?? "—") : "—"}</span>,
        date: <span className="font-mono text-[11px] text-subtle">{fmtDate(s.createdAt)}</span>,
        grant:
          s.access === "RESTRICTED" ? (
            <GrantToggle slug={slug} sourceId={s.id} granted={s.grantedToIncoming} canEdit={canLabel} />
          ) : (
            <span className="text-xs text-subtle">—</span>
          ),
      },
    };
  });

  return (
    <>
      <PageHeader
        title="Sources"
        description="The records Baton reads. Each one is labelled Public, Team or Restricted before any AI sees it."
        actions={
          canConnect ? (
            <Link href={`${base}/sources/add`} className={buttonVariants({ size: "lg", className: "h-10 px-4" })} data-add-sources>
              <Plus className="size-4" />
              Add sources
            </Link>
          ) : (
            <Tooltip content={`Only ${owner} (the owner) connects sources. Switch persona in Viewing as.`}>
              <Button size="lg" className="h-10 px-4" disabled data-add-sources>
                <Plus className="size-4" />
                Add sources
              </Button>
            </Tooltip>
          )
        }
      />
      <LinkTabs
        path={`${base}/sources`}
        current={tab}
        label="Sources views"
        items={[
          { value: "all", label: "All sources", count: sources.length },
          { value: "current", label: "Keep it current" },
          { value: "runs", label: "Pipeline runs" },
        ]}
      />

      {tab === "all" && (
        <ColumnsTable
          ariaLabel="Sources"
          storageKey="baton.sources.columns"
          optional={["cited", "author"]}
          toolbar={
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span><span className="font-mono text-muted">{sources.length}</span> sources</span>
              <span className="text-border">·</span>
              <span><span className="font-mono text-muted">{chunkTotal}</span> chunks</span>
              <span className="text-border">·</span>
              <span><span className="font-mono text-muted">{redactionTotal}</span> redactions</span>
              <span className="hidden text-border md:inline">·</span>
              {[...kinds.entries()].map(([k, n]) => (
                <span key={k} className="hidden items-center gap-1 md:inline-flex">
                  <SourceIcon kind={k} className="size-3" />
                  {KIND_LABEL[k]} <span className="font-mono text-muted">{n}</span>
                </span>
              ))}
            </span>
          }
          columns={[
            { key: "title", header: "Source", sortable: true },
            { key: "access", header: "Access", width: "124px", sortable: true },
            { key: "chunks", header: "Chunks", width: "76px", align: "right", sortable: true },
            { key: "cited", header: "Cited", width: "64px", align: "right", sortable: true },
            { key: "author", header: "Author", width: "132px", sortable: true },
            { key: "date", header: "Date", width: "76px", align: "right", sortable: true },
            { key: "grant", header: `${ppl.arjun.name.split(" ")[0]} can see`, width: "104px", align: "center" },
          ]}
          rows={rows}
        />
      )}

      {tab === "current" && (
        <Card data-testid="sync-card" data-tour="simulate" className="max-w-3xl">
          <CardHeader title="Keep it current" description="Fetch only what changed since the last sync. Reviewed facts are never rewritten." />
          <SyncPanel
            slug={slug}
            canSync={canConnect}
            ownerName={owner}
            repos={syncStates.map((s) => ({ repo: s.provider === "slack" ? `Slack #${(s.cursor as { name?: string } | null)?.name ?? s.externalKey}` : s.externalKey, provider: s.provider, lastSyncedAt: s.lastSyncedAt?.toISOString() ?? null, lastStatus: s.lastStatus, lastError: s.lastError }))}
            demo={isDemoSlug(slug)}
            simulated={sources.some((s) => s.externalId === "sim:commits")}
            approved={(handover?.currentVersion ?? 0) > 0}
          />
        </Card>
      )}

      {tab === "runs" && (
        <Card className="max-w-3xl">
          <CardHeader title="Pipeline" description={run ? `Last run ${fmtDate(run.startedAt)} · ${run.status.toLowerCase()}` : "Not run yet. Run it to turn the sources into graded facts."} />
          <PipelineStepper
            slug={slug}
            stages={stages}
            model={run?.model ?? geminiModel()}
            mode={run?.mode ?? "CACHED"}
            lastRun={runInfo}
            canRun={canConnect}
            activeRunId={activeRunId(run)}
          />
        </Card>
      )}
    </>
  );
}
