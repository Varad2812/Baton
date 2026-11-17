import { BadgeCheck, Lock } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import type { SourceKind } from "@/generated/prisma/enums";
import { allowedAccess, can, canSeeChunk, getActor, projectPersonas } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { getProject } from "@/lib/views/project";
import { fmtDate, KIND_LABEL } from "@/lib/views/format";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { AccessChip } from "@/components/ui/access-chip";
import { Badge } from "@/components/ui/badge";
import { SourceIcon } from "@/components/common/source-icon";
import { PipelineStepper } from "@/components/sources/pipeline-stepper";
import { AddSources } from "@/components/sources/add-sources";
import { GrantToggle } from "@/components/sources/grant-toggle";
import { AccessSelect } from "@/components/sources/access-select";
import { geminiModel } from "@/lib/llm";
import { runSummary } from "@/lib/views/run-summary";
import { SyncPanel } from "@/components/sources/sync-panel";
import { SlackConnect } from "@/components/sources/slack-connect";
import { slackConfig } from "@/lib/connectors/slack/service";
import { getVisitorId } from "@/lib/visitor";
import { isDemoSlug } from "@/lib/demo";

const FIXTURES = [
  { name: "github/commits.json", detail: "60 commits" },
  { name: "github/pulls.json", detail: "12 PRs + reviews" },
  { name: "github/issues.json", detail: "15 issues" },
  { name: "docs/README.md", detail: "42 lines" },
  { name: "docs/architecture.md", detail: "team" },
  { name: "docs/meeting-notes/*.md", detail: "3 notes" },
  { name: "chat/discord-export.json", detail: "153 messages" },
  { name: "tasks/trello-board.csv", detail: "26 cards" },
  { name: "restricted/budget-sponsors.csv", detail: "restricted" },
];

/** A run still in progress (started within the last 5 minutes), which the stepper follows after a refresh. */
function activeRunId(run: { id: string; status: string; startedAt: Date } | null): string | null {
  return run?.status === "RUNNING" && run.startedAt.getTime() > Date.now() - 5 * 60_000 ? run.id : null;
}

export default async function SourcesPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const [project, actor, ppl] = await Promise.all([getProject(slug), getActor(slug), projectPersonas(slug)]);
  const vid = await getVisitorId();
  const [sources, run, allowed, evidence, syncStates, handover, connections] = await Promise.all([
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
    vid ? prisma.connection.findMany({ where: { visitorId: vid, provider: "slack", revokedAt: null }, select: { id: true, teamName: true } }) : Promise.resolve([]),
  ]);
  const slackNotice = sp.slack === "connected" ? `Slack connected: ${String(sp.team ?? "workspace")}. Choose channels below.` : sp.slack === "error" ? String(sp.reason ?? "Slack sign-in failed.") : null;
  const citedByChunk = new Map(evidence.map((e) => [e.chunkId, e._count]));
  const canLabel = can(actor.role, "label_sources");
  const kinds = new Map<SourceKind, number>();
  for (const s of sources) kinds.set(s.kind, (kinds.get(s.kind) ?? 0) + 1);
  const chunkTotal = sources.reduce((n, s) => n + s.chunks.length, 0);
  const redactionTotal = sources.reduce((n, s) => n + s.chunks.reduce((m, c) => m + c._count.redactions, 0), 0);
  const runInfo = await runSummary(run);
  const stages = (run?.stages ?? []) as { stage: string; status: string; ms: number; counts: Record<string, number> }[];

  return (
    <>
      <PageHeader
        title="Sources"
        description="The records Baton reads, each labelled Public, Team or Restricted before any AI sees them."
        tryThis={{ text: "Run the pipeline, then click a step of the staircase to jump to its log.", selector: "[data-run-pipeline]" }}
        meta={
          <>
            <span>
              <span className="font-mono text-muted">{sources.length}</span> sources
            </span>
            <span className="text-border">·</span>
            <span>
              <span className="font-mono text-muted">{chunkTotal}</span> chunks
            </span>
            <span className="text-border">·</span>
            <span>
              <span className="font-mono text-muted">{redactionTotal}</span> redactions
            </span>
            <span className="text-border">·</span>
            {[...kinds.entries()].map(([k, n]) => (
              <span key={k} className="inline-flex items-center gap-1">
                <SourceIcon kind={k} className="size-3" />
                {KIND_LABEL[k]} <span className="font-mono text-muted">{n}</span>
              </span>
            ))}
          </>
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <DataTable
          ariaLabel="Sources"
          fixed
          maxHeight="calc(100vh - 250px)"
          columns={[
            { key: "title", header: "Source", sortable: true },
            { key: "access", header: "Access", width: "118px", sortable: true },
            { key: "chunks", header: "Chunks", width: "68px", align: "right", sortable: true },
            { key: "cited", header: "Cited", width: "60px", align: "right", sortable: true, optional: true },
            { key: "author", header: "Author", width: "116px", sortable: true, optional: true },
            { key: "date", header: "Date", width: "64px", align: "right", sortable: true },
            { key: "grant", header: ppl.arjun.name.split(" ")[0], width: "56px", align: "center" },
          ]}
          rows={sources.map((s) => {
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
                      <span className="truncate text-text">{s.title}</span>
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
          })}
        />
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Pipeline"
              description={run ? `Last run ${fmtDate(run.startedAt)} · ${run.status.toLowerCase()}` : "Not run yet"}
            />
            <PipelineStepper
              slug={slug}
              stages={stages}
              model={run?.model ?? geminiModel()}
              mode={run?.mode ?? "CACHED"}
              lastRun={runInfo}
              canRun={can(actor.role, "connect_sources")}
              activeRunId={activeRunId(run)}
            />
          </Card>
          <Card data-testid="slack-card">
            <CardHeader title="Slack" description="Channels with history; each message keeps its link back to Slack" />
            {slackNotice && (
              <p role="status" className={sp.slack === "error" ? "mx-4 mb-2 rounded-md border border-conflicting/30 bg-conflicting/10 px-3 py-2 text-xs text-conflicting" : "mx-4 mb-2 rounded-md border border-verified/30 bg-verified/10 px-3 py-2 text-xs text-verified"}>
                {slackNotice.slice(0, 300)}
              </p>
            )}
            <SlackConnect
              slug={slug}
              canConnect={can(actor.role, "connect_sources")}
              ownerName={ppl.meera.name.split(" ")[0]}
              config={slackConfig()}
              connections={connections.map((c) => ({ id: c.id, team: c.teamName }))}
              demo={isDemoSlug(slug)}
            />
          </Card>
          <Card data-testid="sync-card">
            <CardHeader title="Keep it current" description="Fetch only what changed since the last sync; reviewed facts are never rewritten" />
            <SyncPanel
              slug={slug}
              canSync={can(actor.role, "connect_sources")}
              ownerName={ppl.meera.name.split(" ")[0]}
              repos={syncStates.map((s) => ({ repo: s.provider === "slack" ? `Slack #${(s.cursor as { name?: string } | null)?.name ?? s.externalKey}` : s.externalKey, provider: s.provider, lastSyncedAt: s.lastSyncedAt?.toISOString() ?? null, lastStatus: s.lastStatus, lastError: s.lastError }))}
              demo={isDemoSlug(slug)}
              simulated={sources.some((s) => s.externalId === "sim:commits")}
              approved={(handover?.currentVersion ?? 0) > 0}
            />
          </Card>
          <Card>
            <CardHeader
              title="Add sources"
              description={canLabel ? "New sources start as Team access" : "Only the owner can connect sources"}
            />
            <AddSources slug={slug} canConnect={can(actor.role, "connect_sources")} fixtures={FIXTURES} />
          </Card>
        </div>
      </div>
    </>
  );
}
