import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { isDemoSlug } from "@/lib/demo";
import { getActor, projectPersonas } from "@/lib/authz";
import { getProject } from "@/lib/views/project";
import { getDashboard } from "@/lib/views/dashboard";
import { nextStep } from "@/lib/views/next-step";
import { PageHeader } from "@/components/shell/page-header";
import { Stat } from "@/components/ui/stat";
import { AnalysisSummary } from "@/components/dashboard/analysis-summary";
import { RoleCard } from "@/components/dashboard/role-card";
import { DemoBanner } from "@/components/dashboard/demo-banner";
import { ChangesBanner } from "@/components/changes/changes-banner";
import { pendingChanges } from "@/lib/sync/service";
import { EvidenceDrawer } from "@/components/ledger/evidence-drawer";

/** Home: who you are and your one next step, what Baton found, and three numbers that matter. */
export default async function HomePage({
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
  const [ppl, changes] = await Promise.all([projectPersonas(slug), pendingChanges(actor, project.id)]);
  const people = { owner: ppl.meera.name.split(" ")[0], successor: ppl.arjun.name.split(" ")[0], reviewer: ppl.rao.name };
  const step = nextStep({ openConflicts: d.openConflicts, openQuestions: d.openGaps, versions: d.versions, slug, changes: changes?.total ?? 0 }, people, actor.role);
  const base = `/p/${slug}`;
  const pct = d.total ? Math.round((d.grades.VERIFIED / d.total) * 100) : 0;

  return (
    <>
      <PageHeader
        title="Home"
        description={`${project.name}: handover from ${ppl.meera.name.split(" ")[0]} to ${people.successor}. Start with your next step; everything else is in the sidebar.`}
      />

      <ChangesBanner changes={changes} slug={slug} actor={actor} reviewer={ppl.rao.name} />

      <div className="space-y-4">
        <RoleCard name={actor.name} roleTitle={ppl[actor.key].roleTitle} role={actor.role} step={step} slug={slug} people={people} />

        <AnalysisSummary d={d} />

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Status" data-tour="kpis">
          <Tile href={`${base}/ledger?grade=VERIFIED`} label="Facts confirmed" help="Backed by an exact quote in 2+ independent sources, or one authoritative record." value={d.grades.VERIFIED} unit={`/ ${d.total}`} footer={`${pct}% of the facts you can see`} />
          <Tile href={`${base}/conflicts`} label="Conflicts open" help="Two sources disagree and nobody has decided which is right yet." value={d.openConflicts} unit={`/ ${d.totalConflicts}`} footer={d.openConflicts ? "A person picks which source is right" : "All settled"} tone={d.openConflicts ? "conflict" : undefined} />
          <Tile href={`${base}/interview`} label="Questions open" help={`Things the records cannot answer. Only ${people.owner} can fill these in.`} value={d.openGaps} unit={`/ ${d.totalGaps}`} footer={d.openGaps ? `${d.highPriorityGaps} high priority · only ${people.owner} can answer` : "All answered"} />
        </section>

        {isDemoSlug(slug) && <DemoBanner />}
        <p className="text-xs text-subtle">
          Timeline, evidence map and activity are on{" "}
          <Link href={`${base}/insights`} className="inline-flex items-center gap-1 text-muted hover:text-text hover:underline">
            Insights <ArrowRight className="size-3" />
          </Link>
        </p>
      </div>
      {/* Citations from Ask Baton open a fact's evidence in place (?claim=). */}
      <EvidenceDrawer slug={slug} projectId={project.id} actor={actor} visible={d.visibleClaims} claimId={typeof sp.claim === "string" ? sp.claim : undefined} />
    </>
  );
}

function Tile({ href, label, help, value, unit, footer, tone }: { href: string; label: string; help: string; value: number; unit: string; footer: string; tone?: "conflict" }) {
  return (
    <Link href={href} title={help} className="group rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary" data-tile={label}>
      <Stat
        label={label}
        value={value}
        unit={unit}
        className={tone === "conflict" ? "h-full border-conflicting/30 transition-colors group-hover:border-conflicting/60" : "h-full transition-colors group-hover:border-muted/40"}
        footer={<span>{footer}</span>}
      />
    </Link>
  );
}
