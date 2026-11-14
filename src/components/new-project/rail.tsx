"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type RailStep = { title: string; sub: string; state: "done" | "current" | "upcoming" | "invalid"; enabled: boolean };

export function ProgressRail({ steps, onSelect }: { steps: RailStep[]; onSelect: (i: number) => void }) {
  return (
    <nav aria-label="Wizard progress" className="sticky top-[72px] self-start">
      <p className="mb-2 px-2 text-[11px] font-medium uppercase tracking-wide text-subtle">New handover</p>
      <ol className="relative">
        {steps.map((s, i) => (
          <li key={s.title} className="relative">
            {i < steps.length - 1 && (
              <span
                aria-hidden
                className={cn("absolute left-[19px] top-8 h-[calc(100%-20px)] w-px", s.state === "done" ? "bg-verified/50" : "bg-border")}
              />
            )}
            <button
              type="button"
              disabled={!s.enabled}
              onClick={() => onSelect(i)}
              aria-current={s.state === "current" ? "step" : undefined}
              className={cn(
                "group relative flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary",
                s.state === "current" ? "bg-surface-2" : s.enabled ? "hover:bg-surface-2/60" : "cursor-default",
              )}
            >
              <span
                className={cn(
                  "mt-px flex size-[22px] shrink-0 items-center justify-center rounded-full border font-mono text-[11px]",
                  s.state === "done" && "border-verified/50 bg-verified/15 text-verified",
                  s.state === "current" && "border-primary bg-primary/10 text-primary",
                  s.state === "invalid" && "border-conflicting/50 bg-conflicting/10 text-conflicting",
                  s.state === "upcoming" && "border-border bg-surface text-subtle",
                )}
              >
                {s.state === "done" ? <Check className="size-3" strokeWidth={3} /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className={cn("block text-[13px] font-medium", s.state === "upcoming" ? "text-muted" : "text-text")}>{s.title}</span>
                <span className="block truncate text-xs text-subtle">{s.sub}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

const PHASES = [
  { key: "connect", title: "Connect", color: "#4C7BD9", line: "Files and the repo are chunked with locators; secrets, emails and phones are redacted first." },
  { key: "reconstruct", title: "Reconstruct", color: "#7A4FD1", line: "Decisions, tasks, risks, owners and contacts are extracted, each citing a verbatim quote." },
  { key: "verify", title: "Verify", color: "#1F9E89", line: "Every quote is string-matched in its chunk, then graded verified, single source or inferred." },
  { key: "review", title: "Review", color: "#C98A2E", line: "Conflicts and checklist gaps become ≤10 interview questions; the reviewer approves a version." },
  { key: "handover", title: "Handover", color: "#E8A33D", line: "The successor gets a role-safe briefing and a 7- and 30-day plan, nothing they can't see." },
];

export function NextPanel({ step }: { step: number }) {
  // Which phase the current wizard step feeds: Sources → Connect, Run → all of them.
  const focus = step === 2 ? ["connect"] : step === 3 ? PHASES.map((p) => p.key) : step === 1 ? ["review", "handover"] : [];
  return (
    <aside className="sticky top-[72px] space-y-3 self-start">
      <div className="rounded-lg border border-border bg-surface">
        <div className="border-b border-border px-4 py-2.5">
          <h2 className="text-[13px] font-semibold text-text">What happens next</h2>
          <p className="mt-0.5 text-xs text-subtle">Five stages, about a minute for a small project</p>
        </div>
        <ol className="divide-y divide-border">
          {PHASES.map((p, i) => (
            <li key={p.key} className={cn("flex gap-2.5 px-4 py-2.5 transition-opacity duration-200", focus.length && !focus.includes(p.key) && "opacity-55")}>
              <span className="mt-[3px] flex size-4 shrink-0 items-center justify-center rounded-[3px] font-mono text-[10px] font-semibold text-bg" style={{ background: p.color }}>
                {i + 1}
              </span>
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-text">{p.title}</div>
                <p className="text-xs leading-snug text-muted">{p.line}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
      <dl className="space-y-2 rounded-lg border border-border bg-surface px-4 py-3 text-xs">
        <div>
          <dt className="text-subtle">Accepted</dt>
          <dd className="font-mono text-[11px] text-muted">.md .txt .csv .json .docx · 5 MB each · 20 files</dd>
        </div>
        <div>
          <dt className="text-subtle">Access labels</dt>
          <dd className="text-muted">Public reaches everyone; Team reaches members and the successor; Restricted only the owner and reviewer unless granted.</dd>
        </div>
        <div>
          <dt className="text-subtle">Model input</dt>
          <dd className="text-muted">Only redacted chunks are sent. Each role&apos;s handover is written from the chunks that role may see.</dd>
        </div>
      </dl>
    </aside>
  );
}
