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
export type RunStatus = "idle" | "running" | "pending" | "error" | "done";

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
 * reads the SSE stream from `streamUrl`. Before the merge every action returns
 * `{ ok: false, pending: true, reason: "will work after merge" }` and the run stops there, saying so.
 */
export function useBuildRun() {
  const [status, setStatus] = useState<RunStatus>("idle");
  const [stages, setStages] = useState(initialStages);
  const [log, setLog] = useState<LogLine[]>([]);
  const [reason, setReason] = useState<string | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const seq = useRef(0);
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
    async (url: string) => {
      const ctrl = new AbortController();
      abort.current = ctrl;
      const res = await fetch(url, { method: "POST", headers: { Accept: "text/event-stream" }, signal: ctrl.signal });
      if (!res.ok || !res.body) throw new Error(`Stream failed (${res.status})`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let failed = false;
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
          let msg: { stage?: string; status?: string; counts?: Record<string, number>; ms?: number; error?: string };
          try {
            msg = JSON.parse(data);
          } catch {
            continue;
          }
          const key = msg.stage as StageKey | undefined;
          if (!key || !PIPELINE_STAGES.some((s) => s.key === key)) {
            if (msg.error) {
              failed = true;
              push("pipeline", "error", msg.error);
            }
            continue;
          }
          const st = normaliseStatus(msg.status);
          if (st === "error") failed = true;
          setStages((prev) => ({ ...prev, [key]: { status: st, ms: msg.ms, counts: msg.counts } }));
          if (st === "done" || st === "error") {
            const counts = msg.counts ? Object.entries(msg.counts).map(([k, v]) => `${v} ${k}`).join(" · ") : "";
            push(key, st === "done" ? "ok" : "error", [st === "done" ? "done" : msg.error ?? "failed", counts, msg.ms !== undefined ? `${msg.ms} ms` : ""].filter(Boolean).join(" · "));
          }
        }
      }
      return !failed;
    },
    [push],
  );

  const run = useCallback(
    async (input: BuildInput) => {
      setStatus("running");
      setReason(null);
      setStages(initialStages());
      setLog([]);
      setSlug(input.project.slug);
      try {
        push("createProject", "info", `${input.project.name} (${input.project.slug}), 3 people, draft handover`);
        if (!check("createProject", await createProject(input.project), "Project, people and draft handover created")) return;

        for (const [i, f] of input.files.entries()) {
          const fd = new FormData();
          fd.set("slug", input.project.slug);
          fd.append("files", f.file);
          fd.append("access", f.access);
          if (!check(`uploadSources ${i + 1}/${input.files.length}`, await uploadSources(fd), `${f.file.name} · ${f.access.toLowerCase()}`)) return;
        }
        if (input.githubUrl) {
          const fd = new FormData();
          fd.set("slug", input.project.slug);
          fd.set("githubUrl", input.githubUrl);
          if (!check("uploadSources github", await uploadSources(fd), input.githubUrl.replace("https://github.com/", ""))) return;
        }

        const started = await startPipeline({ slug: input.project.slug, mode: "LIVE" });
        if (!check("startPipeline", started, started.ok ? `run ${started.runId}` : "")) return;
        if (!started.ok) return;
        setStages((prev) => ({ ...prev, ingest: { status: "running" } }));
        const ok = await stream(started.streamUrl);
        setStatus(ok ? "done" : "error");
        if (!ok) setReason("A stage failed. Fix the source or retry the run.");
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
  }, []);

  return { status, stages, log, reason, slug, run, reset };
}
