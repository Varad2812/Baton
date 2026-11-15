import { getActor, projectPersonas } from "@/lib/authz";
import { PeopleProvider } from "@/components/common/people-context";
import { getShellData } from "@/lib/views/project";
import { fmtDate, fmtMs } from "@/lib/views/format";
import { MobileNav } from "@/components/shell/mobile-nav";
import { Sidebar } from "@/components/shell/sidebar";
import { Breadcrumb } from "@/components/shell/breadcrumb";
import { GlobalSearch } from "@/components/shell/search";
import { PersonaSwitcher } from "@/components/shell/persona-switcher";
import { ResetDemo } from "@/components/shell/reset-demo";
import { Glossary } from "@/components/shell/glossary";
import { StartHere } from "@/components/guide/start-here";
import { getGuideState } from "@/lib/views/guide";
import { PersonaBanner } from "@/components/shell/persona-banner";
import { Stepper } from "@/components/shell/stepper";
import { Tour, TourButton } from "@/components/tour";

export const dynamic = "force-dynamic";

const SEES: Record<string, string> = {
  OWNER: "Can answer the questions only they know. Sees everything.",
  REVIEWER: "Can edit facts, settle conflicts and approve. Sees everything.",
  INCOMING: "Can read the handover, acknowledge it and ask follow-ups. Restricted facts stay hidden.",
  OBSERVER: "Read-only. Sees public facts only.",
};

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const actor = await getActor(slug);
  const shell = await getShellData(slug, actor);
  const ppl = await projectPersonas(slug);
  const personas = Object.values(ppl).map((p) => ({
    ...p,
    sees: SEES[p.role],
  }));
  const first = (n: string) => n.split(" ")[0];
  const people = {
    owner: first(ppl.meera.name),
    successor: first(ppl.arjun.name),
    reviewer: ppl.rao.name,
  };
  const run = shell.lastRun;
  const guide = await getGuideState(shell.project.id);

  return (
    <PeopleProvider value={people}>
      <div className="flex min-h-screen">
        <MobileNav>
        <Sidebar
          slug={slug}
          projectName={shell.project.name}
          status={shell.handover?.status ?? "DRAFT"}
          version={shell.handover?.currentVersion ?? 0}
          counts={shell.counts}
          hidden={shell.counts.hidden}
          handoverLine={
            shell.handover
              ? `${shell.handover.from.split(" ")[0]} → ${shell.handover.to.split(" ")[0]}`
              : "No handover"
          }
          footer={
            run ? (
              <div className="space-y-1 text-xs">
                <div className="flex items-center justify-between text-subtle">
                  <span>Last pipeline run</span>
                  <span
                    className={
                      run.status === "SUCCEEDED"
                        ? "text-verified"
                        : run.status === "FAILED"
                          ? "text-conflicting"
                          : "text-primary"
                    }
                  >
                    {run.status.toLowerCase()}
                  </span>
                </div>
                <div className="font-mono text-[11px] text-muted">
                  {run.mode === "CACHED" ? "cached" : "live"} · {fmtMs(run.ms)}{" "}
                  · {fmtDate(run.at)}
                </div>
              </div>
            ) : (
              <span className="text-xs text-subtle">Pipeline not run yet</span>
            )
          }
        />
        </MobileNav>
        <div className="flex min-w-0 flex-1 flex-col">
          <header
            data-shell="topbar"
            className="sticky top-0 z-40 bg-bg/95 backdrop-blur-[2px]"
          >
            <div className="flex h-12 items-center justify-between gap-2 border-b border-border px-3 md:gap-4 md:px-6">
              <div className="min-w-0 pl-9 md:pl-0"><Breadcrumb slug={slug} projectName={shell.project.name} /></div>
              <div className="flex items-center gap-2">
                <span className="hidden lg:block"><GlobalSearch slug={slug} /></span>
                <Glossary />
                <span className="hidden md:block"><TourButton /></span>
                <PersonaSwitcher current={actor.key} personas={personas} />
                <span className="hidden sm:block"><ResetDemo /></span>
              </div>
            </div>
            <PersonaBanner name={actor.name} role={actor.role} hidden={shell.counts.hidden} />
            <Stepper slug={slug} stages={shell.stages} />
          </header>
          <main className="mx-auto w-full max-w-[1320px] flex-1 px-4 pb-12 pt-6 md:px-6">
            {children}
          </main>
          <Tour />
        </div>
        <StartHere slug={slug} {...guide} people={people} />
      </div>
    </PeopleProvider>
  );
}
