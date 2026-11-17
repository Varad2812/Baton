"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, FileUp, FolderGit2, Loader2 } from "lucide-react";
import { addGithubSource, uploadSources } from "@/app/_actions/pipeline";
import { Button, buttonVariants } from "@/components/ui/button";
import { useActionToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/** Shown after a successful add: the next thing to do is run the pipeline over the new records. */
function Added({ slug, message, onMore }: { slug: string; message: string; onMore: () => void }) {
  return (
    <div className="rounded-md border border-verified/30 bg-verified/10 px-4 py-3 text-[13px]" role="status" data-testid="sources-added">
      <p className="flex items-start gap-2 text-text">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-verified" aria-hidden />
        {message}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3 pl-6">
        <Link href={`/p/${slug}/sources?tab=runs`} className={buttonVariants({ size: "sm" })}>
          Run the pipeline
        </Link>
        <Link href={`/p/${slug}/sources`} className="text-muted hover:text-text hover:underline">
          Back to sources
        </Link>
        <button type="button" onClick={onMore} className="text-muted hover:text-text hover:underline">
          Add more
        </button>
      </div>
    </div>
  );
}

export function UploadForm({ slug, canConnect }: { slug: string; canConnect: boolean }) {
  const [files, setFiles] = useState<File[]>([]);
  const [drag, setDrag] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useActionToast();
  const input = useRef<HTMLInputElement>(null);
  const disabled = !canConnect;

  if (done) return <Added slug={slug} message={done} onMore={() => setDone(null)} />;
  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={disabled}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          setFiles([...e.dataTransfer.files]);
        }}
        className={cn(
          "flex w-full flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-10 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50",
          drag ? "border-primary bg-primary/5" : "border-border hover:border-muted/50",
        )}
      >
        <FileUp className="size-6 text-subtle" />
        <span className="text-[14px] text-text">Drop files here or click to browse</span>
        <span className="font-mono text-[11px] text-subtle">.md .txt .csv .json (chat export) .docx .pdf .zip (Slack export) · 10 files, 5 MB each</span>
      </button>
      <input ref={input} type="file" multiple accept=".md,.txt,.csv,.json,.docx,.pdf,.zip" className="hidden" onChange={(e) => setFiles([...(e.target.files ?? [])])} />
      {files.length > 0 && (
        <ul className="space-y-1 rounded-md border border-border px-3 py-2 text-xs">
          {files.map((f) => (
            <li key={f.name} className="flex justify-between gap-3 font-mono text-muted">
              <span className="truncate">{f.name}</span>
              <span className="shrink-0 text-subtle">{(f.size / 1024).toFixed(1)} KB</span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-subtle">New files start as Team access; you can relabel each one on Sources. Secrets, emails and phone numbers are redacted before storage.</p>
      <Button
        disabled={disabled || files.length === 0 || pending}
        data-upload-submit
        onClick={() =>
          start(async () => {
            // One file per call keeps each request under the 6 MB server-action body limit.
            let r: Awaited<ReturnType<typeof uploadSources>> | null = null;
            for (const f of files) {
              const form = new FormData();
              form.append("files", f);
              form.set("access", "TEAM");
              r = await uploadSources(slug, form);
              if (!r.ok) break;
            }
            if (!r) return;
            if (r.ok && files.length > 1) r = { ...r, message: `Uploaded ${files.length} files; secrets, emails and phone numbers redacted before storage.` };
            toast(r, r.ok ? "Sources added" : undefined);
            if (r.ok) {
              setDone(r.message ?? "Sources added.");
              setFiles([]);
              if (input.current) input.current.value = "";
            }
          })
        }
      >
        {pending && <Loader2 className="size-3.5 animate-spin" />}
        Add {files.length || ""} file{files.length === 1 ? "" : "s"}
      </Button>
    </div>
  );
}

export function GithubForm({ slug, canConnect }: { slug: string; canConnect: boolean }) {
  const [url, setUrl] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useActionToast();
  if (done) return <Added slug={slug} message={done} onMore={() => setDone(null)} />;
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await addGithubSource({ slug, url });
          toast(r, r.ok ? "Repository imported" : undefined);
          if (r.ok) {
            setDone(r.message ?? "Repository imported.");
            setUrl("");
          }
        });
      }}
    >
      <label className="block text-[13px] text-muted" htmlFor="gh-url">
        Public repository URL
      </label>
      <div className="relative">
        <FolderGit2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
        <input
          id="gh-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={!canConnect}
          placeholder="https://github.com/owner/repo"
          className="h-10 w-full rounded-md border border-border bg-bg pl-9 pr-3 font-mono text-[13px] text-text outline-none placeholder:text-subtle focus:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-50"
        />
      </div>
      <p className="text-xs text-subtle">Imports commits, pull requests with review comments, issues and the README. Later, Sync now fetches only what is new.</p>
      <Button type="submit" disabled={!canConnect || !url || pending}>
        {pending && <Loader2 className="size-3.5 animate-spin" />}
        Import repository
      </Button>
    </form>
  );
}
