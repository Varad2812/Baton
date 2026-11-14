"use client";

import Link from "next/link";
import { ArrowRight, Check, CircleAlert, Circle, Info, Loader2, Play, RotateCcw } from "lucide-react";
import { LazyPipelineStaircase } from "@/components/three/lazy";
import { AccessChip } from "@/components/ui/access-chip";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ACCESS, KIND_LABEL, type DetectedKind } from "./schema";
import type { FileEntry } from "./sources-step";
import { fmtBytes } from "./sources-step";
import { PIPELINE_STAGES, type LogLine, type RunStatus, type StageKey, type StageState, type StageStatus } from "./use-build-run";

type Person = { name: string; roleTitle: string };

const KIND_SHORT: Record<DetectedKind, string> = { CHAT: "chat export", TASKS: "task board", NOTES: "meeting note", DOC: "doc" };

const PHASES = [
  { key: "connect", label: "Connect", unit: "sources", count: ["sources", "chunks"] },
  { key: "reconstruct", label: "Reconstruct", unit: "claims", count: ["claims"] },
  { key: "verify", label: "Verify", unit: "quotes", count: ["valid", "quotes", "verified"] },
  { key: "review", label: "Review", unit: "questions", count: ["questions"] },
  { key: "handover", label: "Handover", unit: "", count: [] },
] as const;

function phaseStatus(states: StageState[]): StageStatus {
  if (!states.length) return "idle";
  if (states.some((s) => s.status === "error")) return "error";
  if (states.every((s) => s.status === "done")) return "done";
  if (states.some((s) => s.status === "running" || s.status === "done")) return "running";
  return "idle";
}

function SummaryBlock({ title, onEdit, children }: { title: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-subtle">{title}</h3>
        <button type="button" onClick={onEdit} className="rounded px-1 text-xs text-muted outline-none hover:text-text focus-visible:ring-2 focus-visible:ring-primary">
          Edit
        </button>
      </div>
      {children}
    </div>
  );
}

const TONE_CLASS = { info: "text-muted", ok: "text-verified", pending: "text-primary", error: "text-conflicting" } as const;

export function RunStep({
  project,
  people,
  files,
  githubUrl,
  run,
  onEdit,
  onBuild,
  onReset,
}: {
  project: { name: string; slug: string; description: string };
  people: { departing: Person; incoming: Person; reviewer: Person };
  files: FileEntry[];
  githubUrl: string;
  run: { status: RunStatus; stages: Record<StageKey, StageState>; log: LogLine[]; reason: string | null; slug: string | null };
  onEdit: (step: number) => void;
  onBuild: () => void;
  onReset: () => void;
}) {
  const kinds = (Object.keys(KIND_LABEL) as DetectedKind[])
    .map((k) => [k, files.filter((f) => f.detection.kind === k).length] as const)
    .filter(([, n]) => n > 0);
  const total = files.reduce((s, f) => s + f.file.size, 0);
  const running = run.status === "running";

  const staircase = PHASES.map((p) => {
    const states = PIPELINE_STAGES.filter((s) => s.phase === p.key).map((s) => run.stages[s.key]);
    const status = p.key === "handover" ? (run.status === "done" ? "running" : "idle") : phaseStatus(states);
    const counts = Object.assign({}, ...states.map((s) => s.counts ?? {})) as Record<string, number>;
    const count = (p.count as readonly string[]).map((k) => counts[k]).find((v) => typeof v === "number");
    return { key: p.key, label: p.label, status, count, unit: p.unit || undefined };
  });

  const doneCount = PIPELINE_STAGES.filter((s) => run.stages[s.key].status === "done").length;
  const totalMs = PIPELINE_STAGES.reduce((s, x) => s + (run.stages[x.key].ms ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-surface">
        <div className="grid grid-cols-3 divide-x divide-border">
          <SummaryBlock title="Project" onEdit={() => onEdit(0)}>
            <div className="text-[13px] font-medium text-text">{project.name}</div>
            <div className="font-mono text-[11px] text-subtle">/p/{project.slug}</div>
            <p className="mt-1 line-clamp-2 text-xs text-muted">{project.description}</p>
          </SummaryBlock>
          <SummaryBlock title="People" onEdit={() => onEdit(1)}>
            <ul className="space-y-1.5">
              {(
                [
                  ["OWNER", people.departing],
                  ["INCOMING", people.incoming],
                  ["REVIEWER", people.reviewer],
                ] as const
              ).map(([role, p]) => (
                <li key={role} className="flex min-w-0 items-start gap-2">
                  <Avatar name={p.name} size={20} className="mt-0.5" />
                  <span className="min-w-0 flex-1" title={`${p.name}, ${p.roleTitle}`}>
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-xs text-text">{p.name}</span>
                      <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-subtle">{role}</span>
                    </span>
                    <span className="block truncate text-[11px] text-subtle">{p.roleTitle}</span>
                  </span>
                </li>
              ))}
            </ul>
          </SummaryBlock>
          <SummaryBlock title="Sources" onEdit={() => onEdit(2)}>
            <div className="text-[13px] text-text">
              <span className="font-mono">{files.length}</span> file{files.length === 1 ? "" : "s"}
              <span className="font-mono text-xs text-subtle"> · {fmtBytes(total)}</span>
            </div>
            <div className="mt-1 text-xs text-muted">{kinds.map(([k, n]) => `${n} ${KIND_SHORT[k]}${n === 1 ? "" : "s"}`).join(" · ") || "No files"}</div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {ACCESS.map((a) => {
                const n = files.filter((f) => f.access === a).length;
                return n ? (
                  <span key={a} className="inline-flex items-center gap-1">
                    <AccessChip access={a} />
                    <span className="font-mono text-[11px] text-subtle">{n}</span>
                  </span>
                ) : null;
              })}
            </div>
            {githubUrl && <div className="mt-1.5 truncate font-mono text-[11px] text-muted">{githubUrl.replace("https://github.com/", "github: ")}</div>}
          </SummaryBlock>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
          <p className="text-xs text-subtle">
            Creates the project and a draft handover {people.departing.name.split(" ")[0]} → {people.incoming.name.split(" ")[0]}, reviewed by{" "}
            {people.reviewer.name}. Runs live with Gemini; falls back to cached results if the model is unavailable.
          </p>
          <div className="flex shrink-0 items-center gap-2">
            {run.status !== "idle" && !running && (
              <Button variant="ghost" size="sm" onClick={onReset}>
                <RotateCcw className="size-3.5" />
                Reset
              </Button>
            )}
            <Button size="lg" onClick={onBuild} disabled={running} data-testid="build-handover">
              {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              {run.status === "pending" || run.status === "error" ? "Retry build" : "Build handover"}
            </Button>
          </div>
        </div>
      </div>

      {(run.status === "pending" || run.status === "error") && (
        <div
          role="status"
          className={cn(
            "flex items-start gap-2.5 rounded-lg border px-4 py-3",
            run.status === "pending" ? "border-border bg-surface-2/60" : "border-conflicting/40 bg-conflicting/5",
          )}
        >
          {run.status === "pending" ? <Info className="mt-0.5 size-4 shrink-0 text-muted" /> : <CircleAlert className="mt-0.5 size-4 shrink-0 text-conflicting" />}
          <div className="min-w-0 flex-1 text-[13px]">
            <p className="font-medium text-text">{run.status === "pending" ? "Project creation isn't connected yet" : "The build stopped"}</p>
            <p className="mt-0.5 text-xs text-muted">
              {run.status === "pending"
                ? `The server answered "${run.reason}". Nothing was saved. The FestFlow demo shows a finished run of the same pipeline.`
                : run.reason}
            </p>
          </div>
          {run.status === "pending" && (
            <Link href="/p/festflow/sources" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0")}>
              See a finished run
              <ArrowRight className="size-3.5" />
            </Link>
          )}
        </div>
      )}

      {run.status === "done" && run.slug && (
        <div role="status" className="flex items-center justify-between gap-3 rounded-lg border border-verified/40 bg-verified/5 px-4 py-3">
          <p className="text-[13px] text-text">
            Pipeline finished in <span className="font-mono">{(totalMs / 1000).toFixed(1)} s</span>. The draft handover is ready for the gap interview.
          </p>
          <Link href={`/p/${run.slug}`} className={buttonVariants({ size: "sm" })}>
            Open project
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      )}

      <div className="rounded-lg border border-border bg-surface">
        <div className="flex min-h-11 items-center justify-between border-b border-border px-4 py-2.5">
          <h2 className="text-[13px] font-semibold text-text">Pipeline</h2>
          <span className="font-mono text-[11px] text-subtle">
            {doneCount}/{PIPELINE_STAGES.length} stages{totalMs ? ` · ${(totalMs / 1000).toFixed(1)} s` : ""}
          </span>
        </div>
        <div className="border-b border-border">
          <LazyPipelineStaircase stages={staircase} />
        </div>
        <ol className="divide-y divide-border">
          {PIPELINE_STAGES.map((s, i) => {
            const st = run.stages[s.key];
            return (
              <li key={s.key} className="flex h-10 items-center gap-3 px-4">
                <span className="w-4 text-right font-mono text-[11px] text-subtle">{i + 1}</span>
                <StageIcon status={st.status} />
                <span className={cn("w-[132px] shrink-0 text-[13px]", st.status === "idle" ? "text-muted" : "text-text")}>{s.label}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-subtle" title={s.hint}>
                  {st.counts ? Object.entries(st.counts).map(([k, v]) => `${v} ${k}`).join(" · ") : s.hint}
                </span>
                <span className="w-16 text-right font-mono text-[11px] text-subtle">{st.ms !== undefined ? `${st.ms} ms` : "—"}</span>
              </li>
            );
          })}
        </ol>
        <div className="border-t border-border bg-bg/60 px-4 py-2.5">
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-subtle">Run log</div>
          {run.log.length === 0 ? (
            <p className="font-mono text-[11px] text-subtle">Waiting for “Build handover”.</p>
          ) : (
            <ol className="space-y-0.5 font-mono text-[11px]" aria-live="polite">
              {run.log.map((l) => (
                <li key={l.id} className="flex gap-2">
                  <span className="text-subtle">{l.at.toLocaleTimeString("en-GB", { hour12: false })}</span>
                  <span className="w-[150px] shrink-0 truncate text-muted">{l.call}</span>
                  <span className={TONE_CLASS[l.tone]}>{l.text}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

function StageIcon({ status }: { status: StageStatus }) {
  if (status === "done") return <Check className="size-3.5 text-verified" strokeWidth={2.5} />;
  if (status === "running") return <Loader2 className="size-3.5 animate-spin text-primary" />;
  if (status === "error") return <CircleAlert className="size-3.5 text-conflicting" />;
  return <Circle className="size-3.5 text-border" />;
}
