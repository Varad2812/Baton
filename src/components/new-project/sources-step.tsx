"use client";

import { useRef, useState } from "react";
import { Menu } from "@base-ui/react/menu";
import { Check, ChevronDown, FileJson, FileSpreadsheet, FileText, FileUp, FolderGit2, MessagesSquare, NotebookPen, X } from "lucide-react";
import { AccessChip } from "@/components/ui/access-chip";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Field, TextInput } from "./fields";
import { ACCESS, KIND_LABEL, MAX_FILES, extOf, type AccessLevel, type Detection, type DetectedKind } from "./schema";

export type FileEntry = { id: string; file: File; detection: Detection; access: AccessLevel; sample?: boolean };


const KIND_ICON: Record<DetectedKind, React.ComponentType<{ className?: string }>> = {
  CHAT: MessagesSquare,
  TASKS: FileSpreadsheet,
  NOTES: NotebookPen,
  DOC: FileText,
};

const ACCESS_HELP: Record<AccessLevel, string> = {
  PUBLIC: "Everyone, including club members (observers)",
  TEAM: "Team members and the successor",
  RESTRICTED: "Owner and reviewer; successor only if granted",
};

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function AccessMenu({ value, onChange, name }: { value: AccessLevel; onChange: (v: AccessLevel) => void; name: string }) {
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={`Access for ${name}: ${value.toLowerCase()}. Change`}
        className="inline-flex items-center gap-1 rounded-[5px] outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <AccessChip access={value} />
        <ChevronDown className="size-3 text-subtle" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={4} align="end" className="z-[70]">
          <Menu.Popup className="w-[280px] rounded-lg border border-border bg-surface-2 p-1 shadow-xl shadow-black/50 outline-none">
            {ACCESS.map((a) => (
              <Menu.Item
                key={a}
                onClick={() => onChange(a)}
                className="flex cursor-default items-start gap-2 rounded-md px-2 py-1.5 outline-none data-[highlighted]:bg-surface"
              >
                <AccessChip access={a} className="mt-px w-[104px] shrink-0 [&_svg]:shrink-0" />
                <span className="min-w-0 flex-1 text-xs text-muted">{ACCESS_HELP[a]}</span>
                {a === value && <Check className="mt-0.5 size-3.5 text-primary" />}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

export function SourcesStep({
  files,
  rejected,
  githubUrl,
  githubError,
  filesError,
  sampleNotice,
  onAddFiles,
  onRemove,
  onAccess,
  onGithubUrl,
  onGithubBlur,
  onClearRejected,
}: {
  files: FileEntry[];
  rejected: { name: string; reason: string }[];
  githubUrl: string;
  githubError?: string;
  filesError?: string;
  sampleNotice: boolean;
  onAddFiles: (files: File[]) => void;
  onRemove: (id: string) => void;
  onAccess: (id: string, a: AccessLevel) => void;
  onGithubUrl: (v: string) => void;
  onGithubBlur: () => void;
  onClearRejected: () => void;
}) {
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const total = files.reduce((s, f) => s + f.file.size, 0);
  const byAccess = ACCESS.map((a) => [a, files.filter((f) => f.access === a).length] as const).filter(([, n]) => n > 0);
  const redact = files.reduce((s, f) => s + f.detection.toRedact, 0);
  const full = files.length >= MAX_FILES;

  return (
    <div className="space-y-5">
      {sampleNotice && (
        <p className="rounded-md border border-border bg-surface-2/60 px-3 py-2 text-xs text-muted">
          Loaded 3 sample files from <span className="text-text">MessMate</span>, a hostel mess-menu app run by a student council. Project and
          people were pre-filled where empty. Change anything, or continue to Run.
        </p>
      )}

      <div>
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-xs font-medium text-muted">Files</span>
          <span className="font-mono text-[11px] text-subtle">
            {files.length}/{MAX_FILES}
          </span>
        </div>
        <button
          type="button"
          disabled={full}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            onAddFiles([...e.dataTransfer.files]);
          }}
          aria-describedby="files-hint"
          className={cn(
            "flex w-full items-center gap-3 rounded-md border border-dashed px-4 py-4 text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50",
            drag ? "border-primary bg-primary/5" : filesError ? "border-conflicting/50" : "border-border hover:border-muted/50 hover:bg-surface-2/40",
          )}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-surface-2">
            <FileUp className="size-4 text-muted" />
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] text-text">{full ? "File limit reached" : "Drop files here or click to browse"}</span>
            <span id="files-hint" className="block font-mono text-[11px] text-subtle">
              .md .txt .csv .json (chat export) .docx · 5 MB each · up to {MAX_FILES} files
            </span>
          </span>
        </button>
        <input
          ref={input}
          type="file"
          multiple
          accept=".md,.txt,.csv,.json,.docx"
          className="hidden"
          data-testid="file-input"
          onChange={(e) => {
            onAddFiles([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
        {filesError && files.length === 0 && (
          <p role="alert" className="mt-1 text-xs text-conflicting">
            {filesError}
          </p>
        )}
        {rejected.length > 0 && (
          <div className="mt-2 flex items-start justify-between gap-3 rounded-md border border-conflicting/30 bg-conflicting/5 px-3 py-2 text-xs">
            <ul className="space-y-0.5">
              {rejected.map((r) => (
                <li key={r.name} className="text-muted">
                  <span className="font-mono text-text">{r.name}</span> skipped: {r.reason}
                </li>
              ))}
            </ul>
            <button type="button" onClick={onClearRejected} aria-label="Dismiss skipped files" className="rounded p-0.5 text-subtle hover:text-text">
              <X className="size-3.5" />
            </button>
          </div>
        )}
      </div>

      {files.length > 0 && (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full table-fixed text-left text-[13px]">
            <colgroup>
              <col />
              <col className="w-[100px]" />
              <col className="w-[68px]" />
              <col className="w-[144px]" />
              <col className="w-[36px]" />
            </colgroup>
            <thead className="bg-surface-2/60 text-[11px] uppercase tracking-wide text-subtle">
              <tr className="h-8">
                <th className="px-3 font-medium">File · detected</th>
                <th className="px-2 font-medium">Kind</th>
                <th className="px-2 text-right font-medium">Size</th>
                <th className="px-2 font-medium">Access</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {files.map((f) => {
                const Icon = extOf(f.file.name) === "json" && f.detection.kind === "DOC" ? FileJson : KIND_ICON[f.detection.kind];
                return (
                  <tr key={f.id} className="hover:bg-surface-2/40">
                    <td className="px-3 py-2">
                      <div className="flex min-w-0 items-start gap-2">
                        <Icon className="mt-0.5 size-3.5 shrink-0 text-subtle" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-mono text-[12px] text-text" title={f.file.name}>
                            {f.file.name}
                          </div>
                          <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
                            <span className="truncate text-xs text-subtle" title={f.detection.detail}>
                              {f.detection.detail}
                            </span>
                            {f.detection.toRedact > 0 && (
                              <Tooltip content="Secret-, email- or phone-like strings. Replaced with placeholders on the server before any model call.">
                                <span className="shrink-0 rounded-[4px] border border-primary/30 bg-primary/10 px-1 font-mono text-[10.5px] leading-4 text-primary">
                                  {f.detection.toRedact} to redact
                                </span>
                              </Tooltip>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-2">
                      <Badge variant="neutral" size="sm">
                        {KIND_LABEL[f.detection.kind]}
                      </Badge>
                    </td>
                    <td className="px-2 text-right font-mono text-[12px] text-muted">{fmtBytes(f.file.size)}</td>
                    <td className="px-2">
                      <AccessMenu value={f.access} name={f.file.name} onChange={(a) => onAccess(f.id, a)} />
                    </td>
                    <td className="pr-2 text-right">
                      <button
                        type="button"
                        onClick={() => onRemove(f.id)}
                        aria-label={`Remove ${f.file.name}`}
                        className="rounded p-1 text-subtle outline-none hover:bg-surface-2 hover:text-text focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <X className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex items-center justify-between gap-3 border-t border-border bg-surface-2/40 px-3 py-1.5 font-mono text-[11px] text-subtle">
            <span>
              {files.length} file{files.length === 1 ? "" : "s"} · {fmtBytes(total)}
              {byAccess.map(([a, n]) => ` · ${n} ${a.toLowerCase()}`).join("")}
            </span>
            <span>{redact > 0 ? `${redact} string${redact === 1 ? "" : "s"} to redact` : "nothing to redact found"}</span>
          </div>
        </div>
      )}

      <Field
        id="github-url"
        label="Public GitHub repo URL"
        aside="optional"
        error={githubError}
        hint="Imports commits, PRs with review comments, issues and the README through the REST API. Labelled Public."
      >
        <div className="relative">
          <FolderGit2 className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
          <TextInput
            id="github-url"
            mono
            value={githubUrl}
            invalid={!!githubError}
            onChange={(e) => onGithubUrl(e.target.value)}
            onBlur={onGithubBlur}
            placeholder="https://github.com/owner/repo"
            className="pl-8"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </Field>
    </div>
  );
}
