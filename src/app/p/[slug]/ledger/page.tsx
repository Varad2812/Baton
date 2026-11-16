import { Lock, SearchX } from "lucide-react";
import { demoId } from "@/lib/demo";
import Link from "next/link";
import type { Access, ClaimType, Grade } from "@/generated/prisma/enums";
import { getActor } from "@/lib/authz";
import { getProject } from "@/lib/views/project";
import {
  applyLedgerFilters,
  facetCounts,
  loadClaims,
  parseLedgerFilters,
  supportingSourceCount,
} from "@/lib/views/claims";
import { ACCESS_LABEL, fmtDate, GRADE_LABEL, GRADE_ORDER, TYPE_LABEL } from "@/lib/views/format";
import { RequestAccess } from "@/components/handover/request-access";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { DataTable } from "@/components/ui/data-table";
import { GradeChip, GradeDot } from "@/components/ui/grade-chip";
import { AccessChip } from "@/components/ui/access-chip";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { GradeBar } from "@/components/common/grade-bar";
import { FilterRail } from "@/components/ledger/filter-rail";
import { EvidenceDrawer } from "@/components/ledger/evidence-drawer";

const TYPES: ClaimType[] = ["DECISION", "TASK", "RISK", "DEPENDENCY", "CONTACT", "RECURRING", "QUESTION"];
const ACCESSES: Access[] = ["PUBLIC", "TEAM", "RESTRICTED"];

export default async function LedgerPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const [project, actor] = await Promise.all([getProject(slug), getActor(slug)]);
  const { visible, hiddenCount, hiddenBySection } = await loadClaims(project.id, actor);
  const filters = parseLedgerFilters(sp);
  const sourceId = demoId(slug, typeof sp.source === "string" ? sp.source : undefined);
  const sourceRow = sourceId
    ? await prisma.source.findFirst({ where: { id: sourceId, projectId: project.id }, select: { title: true } })
    : null;
  const rows = applyLedgerFilters(visible, filters).filter(
    (c) => !sourceRow || c.evidence.some((e) => e.chunk.sourceId === sourceId),
  );
  const base = `/p/${slug}/ledger`;
  const claimParam = demoId(slug, typeof sp.claim === "string" ? sp.claim : undefined);
  const plainParams: Record<string, string | undefined> = {
    type: filters.type,
    grade: filters.grade,
    section: filters.section,
    owner: filters.owner,
    access: filters.access,
    q: filters.q,
    source: sourceRow ? sourceId : undefined,
  };
  const qsWith = (claimId: string) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(plainParams)) if (v) next.set(k, v);
    next.set("claim", claimId);
    return `${base}?${next.toString()}`;
  };

  // Facets
  const gradeF = facetCounts(visible, filters, "grade");
  const typeF = facetCounts(visible, filters, "type");
  const sectionF = facetCounts(visible, filters, "section");
  const ownerF = facetCounts(visible, filters, "owner");
  const accessF = facetCounts(visible, filters, "access");
  const owners = new Map<string, string>();
  for (const c of visible) if (c.owner) owners.set(c.owner.id, c.owner.name);
  const sections = [...new Set(visible.map((c) => c.section))].sort();

  const gradeCounts = Object.fromEntries(GRADE_ORDER.map((g) => [g, rows.filter((c) => c.grade === g).length])) as Record<
    Grade,
    number
  >;

  return (
    <>
      <PageHeader
        title="Facts & evidence"
        description="Every fact Baton found, each with the exact quote it came from. No matching quote, no Confirmed badge."
        tryThis={{ text: "Click any row to see its quote highlighted in the original source.", selector: "main tbody tr" }}
        meta={
          <>
            <span>
              <span className="font-mono text-muted">{rows.length}</span> of{" "}
              <span className="font-mono text-muted">{visible.length}</span> facts
            </span>
            <span className="text-border">·</span>
            <span>
              <span className="font-mono text-muted">
                {visible.reduce((s, c) => s + c.evidence.length, 0)}
              </span>{" "}
              quotes
            </span>
            {sourceRow && (
              <Link
                href={base}
                data-testid="source-filter"
                className="inline-flex items-center gap-1 rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-primary hover:bg-primary/20"
              >
                Source: {sourceRow.title} ×
              </Link>
            )}
            {hiddenCount > 0 && (
              <>
                <span className="text-border">·</span>
                <span className="inline-flex items-center gap-1">
                  <Lock className="size-3" /> {hiddenCount} hidden at {actor.role.toLowerCase()} access
                </span>
              </>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[216px_minmax(0,1fr)]">
        <FilterRail
          basePath={base}
          params={plainParams}
          groups={[
            {
              key: "grade",
              label: "Grade",
              options: GRADE_ORDER.map((g) => ({
                value: g,
                label: (
                  <>
                    <GradeDot grade={g} />
                    {GRADE_LABEL[g]}
                  </>
                ),
                count: gradeF.get(g) ?? 0,
              })),
            },
            {
              key: "type",
              label: "Type",
              options: TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t], count: typeF.get(t) ?? 0 })),
            },
            {
              key: "section",
              label: "Section",
              options: sections.map((s) => ({ value: s, label: s, count: sectionF.get(s) ?? 0 })),
            },
            {
              key: "owner",
              label: "Owner",
              options: [
                ...[...owners.entries()]
                  .sort((a, b) => (ownerF.get(b[0]) ?? 0) - (ownerF.get(a[0]) ?? 0))
                  .map(([id, name]) => ({
                    value: id,
                    label: (
                      <>
                        <Avatar name={name} size={16} />
                        {name}
                      </>
                    ),
                    count: ownerF.get(id) ?? 0,
                  })),
                { value: "none", label: <span className="text-subtle">Unassigned</span>, count: ownerF.get("none") ?? 0 },
              ],
            },
            {
              key: "access",
              label: "Access",
              options: ACCESSES.map((a) => ({ value: a, label: ACCESS_LABEL[a], count: accessF.get(a) ?? 0 })),
            },
          ]}
        />

        <div className="min-w-0 space-y-3">
          <div className="flex items-center gap-4 rounded-lg border border-border bg-surface px-4 py-2.5">
            <GradeBar grades={gradeCounts} className="flex-1" legend />
          </div>

          <DataTable
            ariaLabel="Claims"
            fixed
            maxHeight="calc(100vh - 290px)"
            defaultSort={undefined}
            columns={[
              { key: "grade", header: "Grade", width: "128px", sortable: true },
              { key: "claim", header: "Fact", sortable: true },
              { key: "type", header: "Type", width: "96px", sortable: true, optional: true },
              { key: "owner", header: "Owner", width: "136px", sortable: true, optional: true },
              { key: "sources", header: "Src", width: "52px", align: "right", sortable: true },
              { key: "access", header: "Access", width: "112px", sortable: true },
              { key: "date", header: "Date", width: "72px", align: "right", sortable: true },
            ]}
            rows={rows.map((c) => ({
              id: c.id,
              href: qsWith(c.id),
              selected: c.id === claimParam,
              className: c.status === "REJECTED" ? "opacity-50" : undefined,
              sort: {
                grade: GRADE_ORDER.indexOf(c.grade),
                claim: c.title,
                type: c.type,
                owner: c.owner?.name ?? null,
                sources: supportingSourceCount(c),
                access: c.access,
                date: c.date?.getTime() ?? null,
              },
              cells: {
                grade: <GradeChip grade={c.grade} />,
                claim: (
                  <div className="min-w-0 py-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className={c.status === "REJECTED" ? "truncate text-text line-through" : "truncate text-text"}>
                        {c.title}
                      </span>
                      {c.fromTestimony && <Badge variant="testimony" size="sm">testimony</Badge>}
                      {c.status === "EDITED" && <Badge variant="outline" size="sm">edited</Badge>}
                    </div>
                    <div className="truncate text-xs text-subtle">
                      <span className="text-muted/80">{c.section}</span> · {c.gradeReason}
                    </div>
                  </div>
                ),
                type: <span className="text-xs text-muted">{TYPE_LABEL[c.type]}</span>,
                owner: c.owner ? (
                  <span className="flex items-center gap-1.5 truncate text-xs text-muted">
                    <Avatar name={c.owner.name} size={18} />
                    {c.owner.name.split(" ")[0]}
                  </span>
                ) : (
                  <span className="text-xs text-subtle">—</span>
                ),
                sources: <span className="font-mono text-xs text-muted">{supportingSourceCount(c)}</span>,
                access: <AccessChip access={c.access} />,
                date: <span className="font-mono text-[11px] text-subtle">{fmtDate(c.date)}</span>,
              },
            }))}
            empty={
              <EmptyState
                icon={<SearchX />}
                title="No facts match these filters"
                description="Try removing a filter or searching for a topic like “payment” or “Supabase”."
                action={
                  <Link href={base} className={buttonVariants({ variant: "outline", size: "sm" })}>
                    Clear filters
                  </Link>
                }
              />
            }
          />

          {hiddenCount > 0 && (
            <div className="flex items-center justify-between gap-4 rounded-lg border border-dashed border-border px-4 py-3">
              <div className="flex items-center gap-2.5 text-[13px] text-muted">
                <Lock className="size-4 text-subtle" />
                <span>
                  <span className="font-mono text-text">{hiddenCount}</span> fact{hiddenCount === 1 ? "" : "s"} hidden — request
                  access from owner.
                  <span className="ml-1.5 text-xs text-subtle">
                    {Object.entries(hiddenBySection)
                      .map(([s, n]) => `${s} ${n}`)
                      .join(" · ")}
                  </span>
                </span>
              </div>
              <RequestAccess slug={slug} />
            </div>
          )}
        </div>
      </div>

      <EvidenceDrawer slug={slug} projectId={project.id} actor={actor} visible={visible} claimId={claimParam} />
    </>
  );
}
