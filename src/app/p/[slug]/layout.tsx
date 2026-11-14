import { getActor, PERSONAS } from "@/lib/authz";
import { getShellData } from "@/lib/views/project";
import { fmtDate, fmtMs } from "@/lib/views/format";
import { Sidebar } from "@/components/shell/sidebar";
import { Breadcrumb } from "@/components/shell/breadcrumb";
import { GlobalSearch } from "@/components/shell/search";
import { PersonaSwitcher } from "@/components/shell/persona-switcher";
import { ResetDemo } from "@/components/shell/reset-demo";
import { Stepper } from "@/components/shell/stepper";

export const dynamic = "force-dynamic";

const SEES: Record<string, string> = {
  OWNER: "Sees everything, answers the gap interview",
  REVIEWER: "Sees everything, edits and approves versions",
  INCOMING: "Team data + granted restricted sources",
  OBSERVER: "Public data only, read-only",
};

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const actor = await getActor();
  const shell = await getShellData(slug, actor);
  const personas = Object.values(PERSONAS).map((p) => ({ ...p, sees: SEES[p.role] }));
  const run = shell.lastRun;

  return (
    <div className="flex min-h-screen">
      <Sidebar
        slug={slug}
        projectName={shell.project.name}
        status={shell.handover?.status ?? "DRAFT"}
        version={shell.handover?.currentVersion ?? 0}
        counts={shell.counts}
        hidden={shell.counts.hidden}
        handoverLine={shell.handover ? `${shell.handover.from.split(" ")[0]} → ${shell.handover.to.split(" ")[0]}` : "No handover"}
        footer={
          run ? (
            <div className="space-y-1 text-xs">
              <div className="flex items-center justify-between text-subtle">
                <span>Last pipeline run</span>
                <span
                  className={
                    run.status === "SUCCEEDED" ? "text-verified" : run.status === "FAILED" ? "text-conflicting" : "text-primary"
                  }
                >
                  {run.status.toLowerCase()}
                </span>
              </div>
              <div className="font-mono text-[11px] text-muted">
                {run.mode === "CACHED" ? "cached" : "live"} · {fmtMs(run.ms)} · {fmtDate(run.at)}
              </div>
            </div>
          ) : (
            <span className="text-xs text-subtle">Pipeline not run yet</span>
          )
        }
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 bg-bg/95 backdrop-blur-[2px]">
          <div className="flex h-12 items-center justify-between gap-4 border-b border-border px-6">
            <Breadcrumb slug={slug} projectName={shell.project.name} />
            <div className="flex items-center gap-2">
              <GlobalSearch slug={slug} />
              <PersonaSwitcher current={actor.key} personas={personas} />
              <ResetDemo />
            </div>
          </div>
          <Stepper slug={slug} stages={shell.stages} />
        </header>
        <main className="mx-auto w-full max-w-[1320px] flex-1 px-6 pb-12 pt-6">{children}</main>
      </div>
    </div>
  );
}
