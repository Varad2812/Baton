"use client";

import { useRef, useState, useTransition } from "react";
import { FileUp, FolderGit2, Loader2 } from "lucide-react";
import { addGithubSource, uploadSources } from "@/app/_actions/pipeline";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { useActionToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export function AddSources({ slug, canConnect, fixtures }: { slug: string; canConnect: boolean; fixtures: { name: string; detail: string }[] }) {
  const [url, setUrl] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [drag, setDrag] = useState(false);
  const [pending, start] = useTransition();
  const toast = useActionToast();
  const input = useRef<HTMLInputElement>(null);
  const disabled = !canConnect;

  return (
    <Tabs
      listClassName="px-4"
      items={[
        {
          value: "upload",
          label: "Upload",
          content: (
            <div className="space-y-3 px-4 pb-4">
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
                  "flex w-full flex-col items-center gap-1.5 rounded-md border border-dashed px-4 py-5 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50",
                  drag ? "border-primary bg-primary/5" : "border-border hover:border-muted/50",
                )}
              >
                <FileUp className="size-5 text-subtle" />
                <span className="text-[13px] text-text">Drop files or click to browse</span>
                <span className="font-mono text-[11px] text-subtle">.md .txt .csv .json (chat export) .docx .pdf .zip (Slack export) · 10 files, 5 MB each</span>
              </button>
              <input
                ref={input}
                type="file"
                multiple
                accept=".md,.txt,.csv,.json,.docx,.pdf,.zip"
                className="hidden"
                onChange={(e) => setFiles([...(e.target.files ?? [])])}
              />
              {files.length > 0 && (
                <ul className="space-y-1 text-xs">
                  {files.map((f) => (
                    <li key={f.name} className="flex justify-between font-mono text-muted">
                      <span className="truncate">{f.name}</span>
                      <span className="text-subtle">{(f.size / 1024).toFixed(1)} KB</span>
                    </li>
                  ))}
                </ul>
              )}
              <Button
                size="sm"
                className="w-full"
                disabled={disabled || files.length === 0 || pending}
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
          ),
        },
        {
          value: "github",
          label: "GitHub",
          content: (
            <form
              className="space-y-3 px-4 pb-4"
              onSubmit={(e) => {
                e.preventDefault();
                start(async () => {
                  const r = await addGithubSource({ slug, url });
                  toast(r, r.ok ? "Repository imported" : undefined);
                  if (r.ok) setUrl("");
                });
              }}
            >
              <label className="block text-xs text-muted" htmlFor="gh-url">
                Public repository URL
              </label>
              <div className="relative">
                <FolderGit2 className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
                <input
                  id="gh-url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={disabled}
                  placeholder="https://github.com/owner/repo"
                  className="h-8 w-full rounded-md border border-border bg-bg pl-8 pr-2 font-mono text-[12px] text-text outline-none placeholder:text-subtle focus:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-50"
                />
              </div>
              <p className="text-xs text-subtle">Imports commits, PRs with review comments, issues and the README via the REST API.</p>
              <Button size="sm" type="submit" className="w-full" disabled={disabled || !url || pending}>
                {pending && <Loader2 className="size-3.5 animate-spin" />}
                Import repository
              </Button>
            </form>
          ),
        },
        {
          value: "fixtures",
          label: "Demo fixtures",
          count: fixtures.length,
          content: (
            <ul className="space-y-px px-2 pb-3">
              {fixtures.map((f) => (
                <li key={f.name} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-surface-2/60">
                  <span className="truncate font-mono text-muted">{f.name}</span>
                  <span className="shrink-0 text-subtle">{f.detail}</span>
                </li>
              ))}
            </ul>
          ),
        },
      ]}
    />
  );
}
