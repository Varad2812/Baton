import Link from "next/link";
import { ArrowLeft, ChevronRight, FileUp, FolderGit2, MessageSquare } from "lucide-react";
import { can, getActor, projectPersonas } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { getProject } from "@/lib/views/project";
import { slackConfig } from "@/lib/connectors/slack/service";
import { getVisitorId } from "@/lib/visitor";
import { isDemoSlug } from "@/lib/demo";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { GithubForm, UploadForm } from "@/components/sources/add-sources";
import { SlackConnect } from "@/components/sources/slack-connect";
import { cn } from "@/lib/utils";

import { connectDrive } from "@/app/_actions/drive";
import { TeamForm } from "@/components/team-form";

const METHODS = {
  drive: { icon: FileUp, title: "Import from Google Drive", body: "Import a read-only copy of a Google Doc with a link back to its source.", detail: "Google Docs · Restricted on import" },
  upload: {
    icon: FileUp,
    title: "Upload files",
    body: "Notes, docs, chat exports, task boards, PDFs.",
    detail: ".md .txt .csv .json .docx .pdf .zip",
  },
  github: {
    icon: FolderGit2,
    title: "Import from GitHub",
    body: "Commits, pull requests with reviews, issues and the README of a public repo.",
    detail: "github.com/owner/repo",
  },
  slack: {
    icon: MessageSquare,
    title: "Import from Slack",
    body: "Channel history with links back to Slack. Private channels stay Restricted.",
    detail: "demo workspace · your Slack · export .zip",
  },
} as const;
type Method = keyof typeof METHODS;

const FIXTURES = [
  { name: "github/commits.json", detail: "60 commits" },
  { name: "github/pulls.json", detail: "12 PRs + reviews" },
  { name: "github/issues.json", detail: "15 issues" },
  { name: "docs/README.md, architecture.md", detail: "2 docs" },
  { name: "docs/meeting-notes/*.md", detail: "3 notes" },
  { name: "chat/discord-export.json", detail: "153 messages" },
  { name: "tasks/trello-board.csv", detail: "26 cards" },
  { name: "restricted/budget-sponsors.csv", detail: "restricted" },
];

/** Add sources in two steps: choose where the records live, then connect or upload them. */
export default async function AddSourcesPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const method = typeof sp.method === "string" && sp.method in METHODS ? (sp.method as Method) : null;
  const [project, actor, ppl] = await Promise.all([getProject(slug), getActor(slug), projectPersonas(slug)]);
  const canConnect = can(actor.role, "connect_sources");
  const owner = ppl.meera.name.split(" ")[0];
  const base = `/p/${slug}`;
  const vid = method === "slack" ? await getVisitorId() : null;
  const connections = vid ? await prisma.connection.findMany({ where: { visitorId: vid, provider: "slack", revokedAt: null }, select: { id: true, teamName: true } }) : [];
  const slackNotice = sp.slack === "connected" ? `Slack connected: ${String(sp.team ?? "workspace")}. Choose channels below.` : sp.slack === "error" ? String(sp.reason ?? "Slack sign-in failed.") : null;
  const m = method ? METHODS[method] : null;

  return (
    <>
      <Link href={method ? `${base}/sources/add` : `${base}/sources`} className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-text">
        <ArrowLeft className="size-3.5" />
        {method ? "Choose another way" : "Back to sources"}
      </Link>
      <PageHeader
        title={m ? m.title : "Add sources"}
        description={m ? m.body : `Where do ${project.name}'s records live? New sources start as Team access, and secrets, emails and phone numbers are redacted before anything is stored.`}
      />
      <ol className="mb-5 flex items-center gap-2 text-xs" aria-label="Steps">
        <Step n={1} label="Choose a source" state={method ? "done" : "active"} />
        <ChevronRight className="size-3.5 text-subtle" aria-hidden />
        <Step n={2} label="Connect or upload" state={method ? "active" : "todo"} />
        <ChevronRight className="size-3.5 text-subtle" aria-hidden />
        <Step n={3} label="Run the pipeline" state="todo" />
      </ol>

      {!canConnect && (
        <p role="note" className="mb-4 rounded-md border border-border bg-surface px-4 py-2.5 text-[13px] text-muted">
          Only {owner} (the owner) connects sources. You can look around; switch to {owner} in Viewing as to add records.
        </p>
      )}

      {!method && (
        <>
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2" data-testid="add-methods">
            {(Object.keys(METHODS) as Method[]).map((k) => {
              const it = METHODS[k];
              return (
                <li key={k}>
                  <Link
                    href={`${base}/sources/add?method=${k}`}
                    data-add-method={k}
                    className="group flex h-full flex-col rounded-lg border border-border bg-surface p-5 outline-none transition-colors hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <span className="flex size-10 items-center justify-center rounded-md border border-border bg-surface-2 text-primary">
                      <it.icon className="size-5" aria-hidden />
                    </span>
                    <span className="mt-4 text-[15px] font-medium text-text">{it.title}</span>
                    <span className="mt-1 flex-1 text-[13px] leading-relaxed text-muted">{it.body}</span>
                    <span className="mt-4 flex items-center justify-between gap-2 font-mono text-[11px] text-subtle">
                      {it.detail}
                      <ChevronRight className="size-4 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {isDemoSlug(slug) && (
            <details className="mt-6 max-w-2xl rounded-lg border border-border bg-surface px-4 py-3 text-[13px]">
              <summary className="cursor-pointer text-muted hover:text-text">Already loaded in this sample: {FIXTURES.length} fixture files</summary>
              <ul className="mt-2 space-y-px">
                {FIXTURES.map((f) => (
                  <li key={f.name} className="flex items-center justify-between gap-2 py-1 text-xs">
                    <span className="truncate font-mono text-muted">{f.name}</span>
                    <span className="shrink-0 text-subtle">{f.detail}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      {method === "drive" && canConnect && <Card className="max-w-xl p-5">
        <TeamForm action={connectDrive.bind(null, slug)} label="Import Google Doc">
          <label className="block text-sm">Google Docs link<input name="link" type="url" required placeholder="https://docs.google.com/document/d/…" className="mt-1 block w-full rounded border border-border bg-bg p-2"/></label>
          <label className="block text-sm">How to read this document <select name="access" className="ml-2 rounded border border-border bg-bg p-2">
            <option value="public">Anyone with the link can read</option>
            {!!process.env.GOOGLE_DRIVE_CLIENT_ID && !!process.env.GOOGLE_DRIVE_CLIENT_SECRET && !!process.env.NEXT_PUBLIC_APP_URL && <option value="private">Sign in to Google for a private document</option>}
          </select></label>
          <p className="text-xs text-muted">Imports a snapshot as Restricted. Only the owner and reviewer can see it unless the owner grants access. Re-import after editing the document.</p>
        </TeamForm>
        {typeof sp.notice === "string" && <p role="status">{sp.notice.slice(0,250)}</p>}
        <Link className="text-sm text-primary underline" href={base + "/sources?tab=runs"}>Run the pipeline</Link>
      </Card>}
      {method === "upload" && (
        <Card className="max-w-2xl p-5">
          <UploadForm slug={slug} canConnect={canConnect} />
        </Card>
      )}
      {method === "github" && (
        <Card className="max-w-2xl p-5">
          <GithubForm slug={slug} canConnect={canConnect} />
        </Card>
      )}
      {method === "slack" && (
        <div className="max-w-5xl">
          {slackNotice && (
            <p role="status" className={cn("mb-3 rounded-md border px-3 py-2 text-xs", sp.slack === "error" ? "border-conflicting/30 bg-conflicting/10 text-conflicting" : "border-verified/30 bg-verified/10 text-verified")}>
              {slackNotice.slice(0, 300)}
            </p>
          )}
          <SlackConnect slug={slug} canConnect={canConnect} ownerName={owner} config={slackConfig()} connections={connections.map((c) => ({ id: c.id, team: c.teamName }))} demo={isDemoSlug(slug)} />
        </div>
      )}
    </>
  );
}

function Step({ n, label, state }: { n: number; label: string; state: "done" | "active" | "todo" }) {
  return (
    <li className={cn("flex items-center gap-1.5", state === "active" ? "text-text" : state === "done" ? "text-muted" : "text-subtle")} aria-current={state === "active" ? "step" : undefined}>
      <span className={cn("flex size-4 items-center justify-center rounded-full border font-mono text-[10px]", state === "active" ? "border-primary text-primary" : state === "done" ? "border-verified/50 text-verified" : "border-border")}>{n}</span>
      {label}
    </li>
  );
}
