"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Loader2, Play, RotateCcw } from "lucide-react";
import { runPipeline } from "@/app/_actions/pipeline";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Tooltip } from "@/components/ui/tooltip";
import { useActionToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type Stage = { stage: string; status: string; ms: number; counts: Record<string, number> };

const LABEL: Record<string, string> = {
  ingest: "Ingest",
  normalise: "Normalise & redact",
  extract: "Extract claims",
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
  grade: "Verified needs 2 sources or 1 authoritative",
  conflicts: "Pairs on the same topic: contradicts / supersedes",
  gaps: "12-item handover checklist",
  questions: "≤10, ranked by risk × dependent claims",
};

function counts(c: Record<string, number>) {
  return Object.entries(c)
    .map(([k, v]) => `${v} ${k.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().replace("_", " ")}`)
    .join(" · ");
}

export function PipelineStepper({
  slug,
  stages,
  model,
  mode,
  canRun,
}: {
  slug: string;
  stages: Stage[];
  model: string;
  mode: "CACHED" | "LIVE";
  canRun: boolean;
}) {
  const [runMode, setRunMode] = useState<"CACHED" | "LIVE">("CACHED");
  const [active, setActive] = useState<number>(stages.length); // stages.length = all done
  const [pending, start] = useTransition();
  const toast = useActionToast();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  // Replays the last run's stage timings locally (scaled), without touching the server.
  const replay = () => {
    if (timer.current) clearTimeout(timer.current);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return setActive(stages.length);
    let i = 0;
    setActive(0);
    const step = () => {
      const ms = Math.min(1100, 260 + stages[i].ms / 12);
      timer.current = setTimeout(() => {
        i += 1;
        setActive(i);
        if (i < stages.length) step();
      }, ms);
    };
    step();
  };

  const total = stages.reduce((s, x) => s + x.ms, 0);
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
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={replay} disabled={active < stages.length}>
            <RotateCcw className="size-3.5" />
            Replay
          </Button>
          {canRun ? (
            <Button
              size="sm"
              disabled={pending}
              onClick={() => start(async () => toast(await runPipeline({ slug, mode: runMode })))}
            >
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
              Run pipeline
            </Button>
          ) : (
            <Tooltip content="Only the owner can connect sources and run the pipeline">
              <Button size="sm" disabled>
                <Play className="size-3.5" />
                Run pipeline
              </Button>
            </Tooltip>
          )}
        </div>
      </div>
      <ol className="relative px-4 py-3">
        {stages.map((s, i) => {
          const state = i < active ? "done" : i === active ? "running" : "todo";
          return (
            <li key={s.stage} className="relative grid grid-cols-[22px_1fr_auto] gap-x-2.5 pb-3 last:pb-0">
              {i < stages.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute left-[10.5px] top-6 bottom-0 w-px transition-colors duration-200",
                    state === "done" ? "bg-verified/50" : "bg-border",
                  )}
                />
              )}
              <span
                className={cn(
                  "relative mt-0.5 flex size-[22px] items-center justify-center rounded-full border text-[10px] font-semibold transition-colors duration-200",
                  state === "done" && "border-verified/50 bg-verified/15 text-verified",
                  state === "running" && "border-primary bg-primary/15 text-primary",
                  state === "todo" && "border-border bg-surface text-subtle",
                )}
              >
                {state === "done" ? (
                  <Check className="size-3" strokeWidth={3} />
                ) : state === "running" ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  i + 1
                )}
              </span>
              <div className="min-w-0">
                <div className={cn("text-[13px]", state === "todo" ? "text-subtle" : "text-text")}>{LABEL[s.stage] ?? s.stage}</div>
                <div className="truncate text-xs text-subtle">
                  {state === "done" ? counts(s.counts) : HINT[s.stage]}
                </div>
              </div>
              <span className="pt-0.5 font-mono text-[11px] text-muted">
                {state === "done" ? (s.ms < 1000 ? `${s.ms} ms` : `${(s.ms / 1000).toFixed(1)} s`) : "—"}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="flex items-center justify-between border-t border-border px-4 py-2 font-mono text-[11px] text-subtle">
        <span>
          {mode.toLowerCase()} · {model}
        </span>
        <span>total {(total / 1000).toFixed(1)} s</span>
      </div>
    </div>
  );
}
