import { BadgeCheck, Lock } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import type { SourceKind } from "@/generated/prisma/enums";
import { allowedAccess, can, canSeeChunk, getActor } from "@/lib/authz";
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

export default async function SourcesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [project, actor] = await Promise.all([getProject(slug), getActor()]);
  const [sources, run, allowed, evidence] = await Promise.all([
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
  ]);
  const citedByChunk = new Map(evidence.map((e) => [e.chunkId, e._count]));
  const canLabel = can(actor.role, "label_sources");
  const kinds = new Map<SourceKind, number>();
  for (const s of sources) kinds.set(s.kind, (kinds.get(s.kind) ?? 0) + 1);
  const chunkTotal = sources.reduce((n, s) => n + s.chunks.length, 0);
  const redactionTotal = sources.reduce((n, s) => n + s.chunks.reduce((m, c) => m + c._count.redactions, 0), 0);
  const stages = (run?.stages ?? []) as { stage: string; status: string; ms: number; counts: Record<string, number> }[];

  return (
    <>
      <PageHeader
        title="Sources"
        description="Authorised records the pipeline reads. Access labels are inherited by every chunk and enforced on the server before any LLM call."
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
      <div className="grid grid-cols-[minmax(0,1fr)_340px] gap-4">
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
            { key: "grant", header: "Arjun", width: "56px", align: "center" },
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
                      <Tooltip content="Authoritative: a merged PR or approved notes. One quote from it is enough to verify a claim.">
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
              canRun={can(actor.role, "connect_sources")}
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
