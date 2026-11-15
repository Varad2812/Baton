"use client";

import { useCallback, useRef, useState } from "react";
import { createProject, startPipeline, uploadSources } from "@/app/_actions/new-project";
import type { AccessLevel, CreateProjectInput, NewProjectResult } from "./schema";

/** The 8 pipeline stages, in the order the SSE stream reports them. */
export const PIPELINE_STAGES = [
  { key: "ingest", label: "Ingest", hint: "Read uploads and the GitHub repo (commits, PRs, issues, README)", phase: "connect" },
  { key: "normalise", label: "Normalise & redact", hint: "~800-char chunks with locators; secrets, emails, phones redacted", phase: "connect" },
  { key: "extract", label: "Extract claims", hint: "Decisions, tasks, risks, owners, each citing a verbatim quote", phase: "reconstruct" },
  { key: "validate", label: "Validate quotes", hint: "Exact substring match inside the cited chunk; misses dropped", phase: "verify" },
  { key: "grade", label: "Grade", hint: "Verified needs 2 independent sources or 1 authoritative", phase: "verify" },
  { key: "conflicts", label: "Detect conflicts", hint: "Same topic, different answer: contradicts or supersedes", phase: "review" },
  { key: "gaps", label: "Run checklist", hint: "12-item handover checklist; every unmet item becomes MISSING", phase: "review" },
  { key: "questions", label: "Build questions", hint: "≤10 gap questions for the departing person, ranked by risk", phase: "review" },
] as const;

export type StageKey = (typeof PIPELINE_STAGES)[number]["key"];
export type StageStatus = "idle" | "running" | "done" | "error";
export type StageState = { status: StageStatus; ms?: number; counts?: Record<string, number> };

export type LogTone = "info" | "ok" | "pending" | "error";
export type LogLine = { id: number; at: Date; call: string; tone: LogTone; text: string };
/** "unavailable": sources are saved but the model could not extract claims (quota, timeout, offline). */
export type RunStatus = "idle" | "running" | "pending" | "error" | "unavailable" | "done";
/** What the server kept, from the ingest / normalise stage counts. */
export type Saved = { sources?: number; chunks?: number; redactions?: number };

export type BuildInput = {
  project: CreateProjectInput;
  files: { file: File; access: AccessLevel }[];
  githubUrl?: string;
};

const initialStages = () =>
  Object.fromEntries(PIPELINE_STAGES.map((s) => [s.key, { status: "idle" } satisfies StageState])) as Record<StageKey, StageState>;

function normaliseStatus(s: unknown): StageStatus {
  const v = String(s ?? "").toLowerCase();
  if (/err|fail/.test(v)) return "error";
  if (/done|succeed|complete|ok|finish/.test(v)) return "done";
  if (/run|start|progress/.test(v)) return "running";
  return "idle";
}

/**
 * Runs createProject → uploadSources (one call per file, then the GitHub URL) → startPipeline, then
 * reads the SSE stream from `streamUrl`. A retry skips what already succeeded for the same slug
 * (project, uploaded files), so "Retry" after a model outage only restarts the pipeline.
 */
export function useBuildRun() {
  const [status, setStatus] = useState<RunStatus>("idle");
  const [stages, setStages] = useState(initialStages);
  const [log, setLog] = useState<LogLine[]>([]);
  const [reason, setReason] = useState<string | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved>({});
  const [mode, setMode] = useState<"LIVE" | "CACHED" | null>(null);
  const [runInfo, setRunInfo] = useState<{ mode: "LIVE" | "CACHED"; model: string; calls: number; ms: number | null; fellBack: boolean } | null>(null);
  const seq = useRef(0);
  /** Survives retries: which project was created and which uploads already went through. */
  const done = useRef<{ slug: string | null; uploads: Set<string> }>({ slug: null, uploads: new Set() });
  const abort = useRef<AbortController | null>(null);

  const push = useCallback((call: string, tone: LogTone, text: string) => {
    seq.current += 1;
    const line = { id: seq.current, at: new Date(), call, tone, text };
    setLog((xs) => [...xs, line]);
  }, []);

  /** Returns true when the run may continue. */
  const check = useCallback(
    (call: string, r: NewProjectResult, okText: string) => {
      if (r.ok) {
        push(call, "ok", okText);
        return true;
      }
      if (r.pending) {
        push(call, "pending", `Not connected yet: ${r.reason}. Nothing was saved.`);
        setReason(r.reason);
        setStatus("pending");
      } else {
        push(call, "error", r.reason);
        setReason(r.reason);
        setStatus("error");
      }
      return false;
    },
    [push],
  );

  const stream = useCallback(
    async (url: string, body: { runId: string; mode: "LIVE" | "CACHED" }): Promise<"done" | "error" | "unavailable"> => {
      const ctrl = new AbortController();
      abort.current = ctrl;
      const res = await fetch(url, {
        method: "POST",
        headers: { Accept: "text/event-stream", "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? `The run could not start (HTTP ${res.status}).`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let failed = false;
      let outcome: "done" | "error" | "unavailable" | null = null;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const events = buf.split(/\n\n/);
        buf = events.pop() ?? "";
        for (const ev of events) {
          const data = ev
            .split("\n")
            .filter((l) => l.startsWith("data:"))
            .map((l) => l.slice(5).trim())
            .join("\n");
          if (!data) continue;
          let msg: { stage?: string; status?: string; counts?: Record<string, number>; ms?: number; error?: string; message?: string; code?: string; mode?: "LIVE" | "CACHED"; llmCalls?: number; model?: string; fellBack?: boolean };
          try {
            msg = JSON.parse(data);
          } catch {
            continue;
          }
          const key = msg.stage as StageKey | undefined;
          if (msg.stage === "done") {
            outcome = "done";
            setMode(msg.mode ?? null);
            if (msg.mode)
              setRunInfo({ mode: msg.mode, model: msg.model ?? "", calls: msg.llmCalls ?? 0, ms: msg.ms ?? null, fellBack: !!msg.fellBack });
            if (msg.message) push("pipeline", "info", msg.message);
            continue;
          }
          if (msg.stage === "error" || !key || !PIPELINE_STAGES.some((s) => s.key === key)) {
            const text = msg.message ?? msg.error;
            if (msg.stage === "error" || text) {
              failed = true;
              outcome = msg.code === "LLM_UNAVAILABLE" ? "unavailable" : "error";
              setReason(text ?? "The run failed.");
              push("pipeline", outcome === "unavailable" ? "pending" : "error", text ?? "failed");
              setStages((prev) =>
                Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, v.status === "running" ? { ...v, status: "error" } : v])) as Record<StageKey, StageState>,
              );
            }
            continue;
          }
          if (key === "ingest" || key === "normalise") {
            const c = msg.counts ?? {};
            setSaved((prev) => ({
              ...prev,
              ...(typeof c.sources === "number" ? { sources: c.sources } : {}),
              ...(typeof c.chunks === "number" ? { chunks: c.chunks } : {}),
              ...(typeof c.redactions === "number" ? { redactions: c.redactions } : {}),
            }));
          }
          const st = normaliseStatus(msg.status);
          if (st === "error") failed = true;
          setStages((prev) => ({ ...prev, [key]: { status: st, ms: msg.ms, counts: msg.counts } }));
          if (st === "done" || st === "error") {
            const counts = msg.counts ? Object.entries(msg.counts).map(([k, v]) => `${v} ${k}`).join(" · ") : "";
            push(key, st === "done" ? "ok" : "error", [st === "done" ? "done" : msg.message ?? msg.error ?? "failed", counts, msg.ms !== undefined ? `${msg.ms} ms` : ""].filter(Boolean).join(" · "));
          }
        }
      }
      return outcome ?? (failed ? "error" : "done");
    },
    [push],
  );

  const run = useCallback(
    async (input: BuildInput) => {
      const slug = input.project.slug;
      if (done.current.slug !== slug) done.current = { slug: null, uploads: new Set() };
      setStatus("running");
      setReason(null);
      setStages(initialStages());
      setLog([]);
      setSaved({});
      setMode(null);
      setSlug(slug);
      try {
        if (done.current.slug === slug) {
          push("createProject", "info", `/p/${slug} already created; reusing it`);
        } else {
          push("createProject", "info", `${input.project.name} (${slug}), 3 people, draft handover`);
          if (!check("createProject", await createProject(input.project), "Project, people and draft handover created")) return;
          done.current.slug = slug;
        }

        const fileKey = (f: File, access: string) => `${f.name}:${f.size}:${f.lastModified}:${access}`;
        for (const [i, f] of input.files.entries()) {
          const k = fileKey(f.file, f.access);
          if (done.current.uploads.has(k)) continue;
          const fd = new FormData();
          fd.set("slug", slug);
          fd.append("files", f.file);
          fd.append("access", f.access);
          if (!check(`uploadSources ${i + 1}/${input.files.length}`, await uploadSources(fd), `${f.file.name} · ${f.access.toLowerCase()} · chunked and redacted`)) return;
          done.current.uploads.add(k);
        }
        if (input.githubUrl && !done.current.uploads.has(`gh:${input.githubUrl}`)) {
          const fd = new FormData();
          fd.set("slug", slug);
          fd.set("githubUrl", input.githubUrl);
          if (!check("uploadSources github", await uploadSources(fd), input.githubUrl.replace("https://github.com/", ""))) return;
          done.current.uploads.add(`gh:${input.githubUrl}`);
        }

        const started = await startPipeline({ slug, mode: "LIVE" });
        if (!check("startPipeline", started, started.ok ? `run ${started.runId}` : "")) return;
        if (!started.ok) return;
        setStages((prev) => ({ ...prev, ingest: { status: "running" } }));
        const outcome = await stream(started.streamUrl, { runId: started.runId, mode: "LIVE" });
        setStatus(outcome);
        if (outcome === "error") setReason((r) => r ?? "A stage failed. Fix the source or retry the run.");
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
        const text = e instanceof Error ? e.message : "Network error";
        push("run", "error", text);
        setReason(text);
        setStatus("error");
      }
    },
    [check, push, stream],
  );

  const reset = useCallback(() => {
    abort.current?.abort();
    setStatus("idle");
    setStages(initialStages());
    setLog([]);
    setReason(null);
    setSaved({});
    setMode(null);
  }, []);

  return { status, stages, log, reason, slug, saved, mode, runInfo, run, reset };
}
