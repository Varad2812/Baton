"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RunBadge } from "@/components/common/run-badge";
import type { RunSummary } from "@/lib/views/run-summary";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, Info, Loader2, Play, RotateCw } from "lucide-react";
import { LazyPipelineStaircase } from "@/components/three/lazy";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Stage = { stage: string; status: string; ms: number; counts: Record<string, number> };
type StageState = "todo" | "running" | "done" | "error" | "skipped";
type Row = { stage: string; state: StageState; ms: number | null; counts: Record<string, number>; message?: string };
type StreamEvent = {
  stage: string;
  status: "running" | "done" | "error" | "skipped";
  counts?: Record<string, number>;
  ms?: number;
  message?: string;
  runId?: string;
  mode?: "LIVE" | "CACHED";
  llmCalls?: number;
  fellBack?: boolean;
};

const STAGES = ["ingest", "normalise", "extract", "validate", "grade", "conflicts", "gaps", "questions"] as const;

const LABEL: Record<string, string> = {
  ingest: "Ingest",
  normalise: "Normalise & redact",
  extract: "Extract facts",
  validate: "Validate quotes",
  grade: "Grade",
  conflicts: "Detect conflicts",
  gaps: "Run checklist",
  questions: "Build questions",
};

const HINT: Record<string, string> = {
  ingest: "Fixtures, uploads or a public GitHub repo",
  normalise: "~800-char chunks with locators; secrets, emails, phones redacted before any LLM call",
  extract: "Gemini, JSON schema, quotes copied verbatim",
  validate: "Exact substring match inside the cited chunk",
  grade: "Confirmed needs 2 sources or 1 authoritative",
  conflicts: "Pairs on the same topic: contradicts / supersedes",
  gaps: "12-item handover checklist",
  questions: "≤10, ranked by risk × dependent facts",
};

/** 8 pipeline stages → the 5 product phases shown on the staircase. */
const PHASES: { key: string; label: string; stages: string[]; count: (c: Record<string, Record<string, number>>) => number | undefined; unit: string }[] = [
  { key: "connect", label: "Connect", stages: ["ingest", "normalise"], count: (c) => c.normalise?.chunks ?? c.ingest?.sources, unit: "chunks" },
  { key: "reconstruct", label: "Reconstruct", stages: ["extract"], count: (c) => c.extract?.claims, unit: "facts" },
  { key: "verify", label: "Verify", stages: ["validate", "grade"], count: (c) => c.validate?.valid, unit: "quotes" },
  { key: "review", label: "Review", stages: ["conflicts", "gaps"], count: (c) => (c.conflicts ? (c.conflicts.contradicts ?? 0) + (c.gaps?.missing ?? 0) : undefined), unit: "to settle" },
  { key: "handover", label: "Handover", stages: ["questions"], count: (c) => c.questions?.questions, unit: "questions" },
];

const COUNT_WORD: Record<string, string> = { claims: "facts", verified: "confirmed", inferred: "AI inference", contradicts: "conflicts" };

function countsText(c: Record<string, number>) {
  return Object.entries(c)
    .map(([k, v]) => `${v} ${COUNT_WORD[k] ?? k.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().replace("_", " ")}`)
    .join(" · ");
}

const fmt = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);

function fromRun(stages: Stage[]): Row[] {
  return STAGES.map((s) => {
    const r = stages.find((x) => x.stage === s);
    return r
      ? { stage: s, state: (r.status === "error" ? "error" : r.status === "skipped" ? "skipped" : "done") as StageState, ms: r.ms, counts: r.counts ?? {} }
      : { stage: s, state: "todo" as StageState, ms: null, counts: {} };
  });
}

/** Parses an SSE body ("data: {...}\n\n" frames, ": keep-alive" comments) into events. */
async function readEvents(body: ReadableStream<Uint8Array>, onEvent: (e: StreamEvent) => void) {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const frame = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const data = frame
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .join("");
      if (data) onEvent(JSON.parse(data) as StreamEvent);
    }
  }
}

export function PipelineStepper({
  slug,
  stages,
  model,
  mode,
  canRun,
  lastRun,
}: {
  slug: string;
  stages: Stage[];
  model: string;
  mode: "CACHED" | "LIVE";
  canRun: boolean;
  lastRun?: RunSummary | null;
}) {
  const router = useRouter();
  const [runMode, setRunMode] = useState<"CACHED" | "LIVE">("CACHED");
  // Live rows while/after a run in this tab; otherwise the last stored run from the server.
  const [liveRows, setRows] = useState<Row[] | null>(null);
  const rows = useMemo(() => liveRows ?? fromRun(stages), [liveRows, stages]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [lastMode, setLastMode] = useState(mode);
  const [badge, setBadge] = useState<RunSummary | null>(lastRun ?? null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const run = useCallback(async () => {
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    setRunning(true);
    setError(null);
    setNote(null);
    setRows(STAGES.map((s) => ({ stage: s, state: "todo", ms: null, counts: {} })));
    const requested = runMode;
    try {
      const res = await fetch(`/api/projects/${slug}/pipeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: requested }),
        signal: ctl.signal,
      });
      if (!res.ok || !res.body || !res.headers.get("content-type")?.includes("text/event-stream")) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? `The pipeline could not start (HTTP ${res.status}).`);
      }
      let finished = false;
      await readEvents(res.body, (e) => {
        if (e.stage === "done") {
          finished = true;
          setLastMode(e.mode ?? requested);
          setBadge({
            mode: e.mode ?? requested,
            model,
            calls: e.llmCalls ?? 0,
            ms: e.ms ?? null,
            fellBack: e.fellBack ?? (e.mode === "CACHED" && requested === "LIVE"),
          });
          if (e.mode === "CACHED") {
            setNote(
              requested === "LIVE"
                ? `The model was unavailable, so the run finished from the cached result. ${e.message ?? ""}`.trim()
                : "Replayed from the cached pipeline result: same stages, no model calls.",
            );
          }
          return;
        }
        if (e.stage === "error") {
          finished = true;
          setError(e.message ?? "The pipeline failed. Nothing was changed.");
          setRows((rs) => (rs ?? []).map((r) => (r.state === "running" ? { ...r, state: "error" } : r)));
          return;
        }
        setRows((rs) =>
          (rs ?? []).map((r) =>
            r.stage === e.stage
              ? {
                  ...r,
                  state: e.status === "running" ? "running" : e.status,
                  ms: e.ms ?? r.ms,
                  counts: e.counts ?? r.counts,
                  message: e.message,
                }
              : r,
          ),
        );
      });
      if (!finished) throw new Error("The connection closed before the run finished. Reload to see the latest run.");
      router.refresh();
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }, [runMode, router, slug]);

  const staircase = useMemo(() => {
    const byStage = Object.fromEntries(rows.map((r) => [r.stage, r.counts]));
    return PHASES.map((p) => {
      const rs = rows.filter((r) => p.stages.includes(r.stage));
      const status = rs.some((r) => r.state === "error")
        ? "error"
        : rs.every((r) => r.state === "done" || r.state === "skipped")
          ? "done"
          : rs.some((r) => r.state !== "todo")
            ? "running"
            : "idle";
      return { key: p.key, label: p.label, status, count: status === "done" ? p.count(byStage) : undefined, unit: p.unit } as const;
    });
  }, [rows]);

  const total = rows.reduce((s, r) => s + (r.ms ?? 0), 0);
  const runButton = (
    <Button size="sm" disabled={!canRun || running} onClick={run} data-run-pipeline>
      {running ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
      {running ? "Running…" : "Run pipeline"}
    </Button>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3">
        <SegmentedControl
          size="sm"
          ariaLabel="Run mode"
          value={runMode}
          onChange={setRunMode}
          options={[
            { value: "CACHED", label: "Cached" },
            { value: "LIVE", label: <span className="whitespace-nowrap">Live · Gemini</span> },
          ]}
        />
        {canRun ? runButton : <Tooltip content="Only the owner can connect sources and run the pipeline">{runButton}</Tooltip>}
      </div>
      <div className="px-2 pt-2">
        <LazyPipelineStaircase
          stages={staircase.map((s) => ({ ...s }))}
          compact
          onStageClick={(key) => {
            const phase = PHASES.find((p) => p.key === key);
            const li = document.querySelector<HTMLElement>(`li[data-stage="${phase?.stages[0] ?? key}"]`);
            if (!li) return;
            li.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
            li.animate([{ background: "color-mix(in srgb, #E8A33D 22%, transparent)" }, { background: "transparent" }], { duration: 1400 });
          }}
        />
      </div>
      {note && (
        <p className="mx-4 mb-1 flex items-start gap-1.5 rounded-md border border-border bg-surface-2/60 px-2.5 py-1.5 text-xs text-muted" role="status">
          <Info className="mt-px size-3.5 shrink-0 text-subtle" /> {note}
        </p>
      )}
      {error && (
        <div className="mx-4 mb-1 flex items-start justify-between gap-2 rounded-md border border-conflicting/35 bg-conflicting/10 px-2.5 py-1.5 text-xs text-conflicting" role="alert">
          <span className="flex items-start gap-1.5">
            <AlertCircle className="mt-px size-3.5 shrink-0" /> {error}
          </span>
          {canRun && (
            <button type="button" onClick={run} className="inline-flex shrink-0 items-center gap-1 underline-offset-2 hover:underline">
              <RotateCw className="size-3" /> Retry
            </button>
          )}
        </div>
      )}
      <ol className="relative px-4 py-3" aria-label="Pipeline stages" aria-live="polite">
        {rows.map((s, i) => (
          <li key={s.stage} data-stage={s.stage} data-state={s.state} className="relative grid grid-cols-[22px_1fr_auto] gap-x-2.5 pb-3 last:pb-0">
            {i < rows.length - 1 && (
              <span
                aria-hidden
                className={cn(
                  "absolute left-[10.5px] top-6 bottom-0 w-px transition-colors duration-200",
                  s.state === "done" ? "bg-verified/50" : "bg-border",
                )}
              />
            )}
            <span
              className={cn(
                "relative mt-0.5 flex size-[22px] items-center justify-center rounded-full border text-[10px] font-semibold transition-colors duration-200",
                (s.state === "done" || s.state === "skipped") && "border-verified/50 bg-verified/15 text-verified",
                s.state === "running" && "border-primary bg-primary/15 text-primary",
                s.state === "error" && "border-conflicting/60 bg-conflicting/15 text-conflicting",
                s.state === "todo" && "border-border bg-surface text-subtle",
              )}
            >
              {s.state === "done" || s.state === "skipped" ? (
                <Check className="size-3" strokeWidth={3} />
              ) : s.state === "running" ? (
                <Loader2 className="size-3 animate-spin" />
              ) : s.state === "error" ? (
                <AlertCircle className="size-3" />
              ) : (
                i + 1
              )}
            </span>
            <div className="min-w-0">
              <div className={cn("text-[13px]", s.state === "todo" ? "text-subtle" : "text-text")}>{LABEL[s.stage] ?? s.stage}</div>
              <div className="truncate text-xs text-subtle">
                {s.state === "done" || s.state === "running"
                  ? countsText(s.counts) || s.message || HINT[s.stage]
                  : s.state === "skipped"
                    ? "skipped"
                    : HINT[s.stage]}
              </div>
            </div>
            <span className="pt-0.5 font-mono text-[11px] text-muted">{s.ms != null && s.state !== "todo" ? fmt(s.ms) : "—"}</span>
          </li>
        ))}
      </ol>
      <div className="flex items-center justify-between border-t border-border px-4 py-2 font-mono text-[11px] text-subtle">
        {badge ? (
          <RunBadge {...badge} />
        ) : (
          <span>
            {lastMode.toLowerCase()} · {model}
          </span>
        )}
        <span>total {(total / 1000).toFixed(1)} s</span>
      </div>
    </div>
  );
}
