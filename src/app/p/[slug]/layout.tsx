import { getActor, projectPersonas } from "@/lib/authz";
import { PeopleProvider } from "@/components/common/people-context";
import { getShellData } from "@/lib/views/project";
import { journeyState } from "@/lib/views/journey";
import { MobileNav } from "@/components/shell/mobile-nav";
import { Sidebar } from "@/components/shell/sidebar";
import { Breadcrumb } from "@/components/shell/breadcrumb";
import { GlobalSearch } from "@/components/shell/search";
import { PersonaSwitcher } from "@/components/shell/persona-switcher";
import { ResetDemo } from "@/components/shell/reset-demo";
import { HelpMenu } from "@/components/shell/help-menu";
import { StartHere } from "@/components/guide/start-here";
import { getGuideState } from "@/lib/views/guide";
import { PersonaBanner } from "@/components/shell/persona-banner";
import { Tour } from "@/components/tour";
import { AskBaton } from "@/components/assistant/ask-baton";
import { Suspense } from "react";
import { Welcome } from "@/components/welcome/welcome";

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
  const guide = await getGuideState(shell.project.id);
  const journey = journeyState({
    sources: shell.counts.sources,
    analysed: shell.lastRun?.status === "SUCCEEDED",
    // Project-wide, so every persona sees the same journey (counts only, never content).
    openConflicts: shell.journey.openConflicts,
    openGaps: shell.journey.openGaps,
    approved: shell.counts.versions > 0,
  });

  return (
    <PeopleProvider value={people}>
      <div className="flex min-h-screen">
        <MobileNav>
        <Sidebar
          slug={slug}
          role={actor.role}
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
          journey={journey}
        />
        </MobileNav>
        <div className="flex min-w-0 flex-1 flex-col">
          <header
            data-shell="topbar"
            className="sticky top-0 z-40 bg-bg/95 backdrop-blur-[2px]"
          >
            <div className="flex h-12 items-center justify-between gap-2 border-b border-border px-3 md:gap-4 md:px-6">
              <div className="hidden min-w-0 md:block"><Breadcrumb slug={slug} projectName={shell.project.name} /></div>
              <div className="ml-auto flex items-center gap-2 pl-10 md:pl-0">
                <span className="hidden lg:block"><GlobalSearch slug={slug} /></span>
                <AskBaton
                  slug={slug}
                  persona={actor.key}
                  personaName={actor.name}
                  projectName={shell.project.name}
                  people={{
                    owner: people.owner,
                    ownerFull: ppl.meera.name,
                    successor: people.successor,
                    successorFull: ppl.arjun.name,
                    reviewer: ppl.rao.name,
                    observer: ppl.kabir.name,
                  }}
                />
                <HelpMenu slug={slug} />
                <PersonaSwitcher current={actor.key} personas={personas} />
                <span className="hidden sm:block"><ResetDemo /></span>
              </div>
            </div>
            <PersonaBanner name={actor.name} role={actor.role} hidden={shell.counts.hidden} />
          </header>
          <main className="mx-auto w-full max-w-[1320px] flex-1 px-4 pb-12 pt-6 md:px-6">
            {children}
          </main>
          <Tour />
          <Suspense fallback={null}>
            <Welcome />
          </Suspense>
        </div>
        <StartHere slug={slug} {...guide} people={people} />
      </div>
    </PeopleProvider>
  );
}
