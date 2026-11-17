import { CircleHelp } from "lucide-react";
import type { DashboardData } from "@/lib/views/dashboard";
import { Info } from "@/components/ui/info";
import { GRADE_COLOR, GRADE_HELP, GRADE_LABEL, GRADE_ORDER } from "@/lib/views/format";
import { CountUp } from "@/components/ui/count-up";
import { Card } from "@/components/ui/card";
import { Tooltip } from "@/components/ui/tooltip";
import { GradeBar } from "@/components/common/grade-bar";

function N({ v }: { v: number }) {
  return <strong className="font-semibold text-text"><CountUp value={v} /></strong>;
}

/** What Baton read and found, in one sentence, with the grade mix and the readiness score. */
export function AnalysisSummary({ d }: { d: DashboardData }) {
  const r = d.read;
  const parts = [
    [r.commits, "commits"],
    [r.prs, "PRs"],
    [r.issues, "issues"],
    [r.messages, "messages"],
    [r.docs, "docs"],
    [r.tasks, "tasks"],
  ].filter(([n]) => (n as number) > 0) as [number, string][];
  const missing = d.grades.MISSING;
  return (
    <section aria-label="Analysis complete" data-tour="summary">
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border px-5 py-2.5 text-xs">
          <span className="size-1.5 rounded-full bg-verified" />
          <span className="font-medium text-text">Analysis complete</span>
          <span className="hidden text-subtle sm:inline">· every number is counted from the stored records</span>
          <span className="ml-auto inline-flex items-center gap-1.5 text-muted" data-testid="readiness">
            Handover readiness <span className="font-mono text-text">{d.readiness}</span>
            <span className="font-mono text-subtle">/ 100</span>
            <Tooltip
              content={
                <div className="space-y-1">
                  <p className="font-medium">How readiness is scored</p>
                  <ReadinessRow label="Verified share" weight={40} v={d.readinessParts.verified} />
                  <ReadinessRow label="Conflicts resolved" weight={20} v={d.readinessParts.conflicts} />
                  <ReadinessRow label="Checklist coverage" weight={25} v={d.readinessParts.checklist} />
                  <ReadinessRow label="Gap questions answered" weight={15} v={d.readinessParts.gaps} />
                </div>
              }
            >
              <CircleHelp className="size-3.5 text-subtle" aria-label="How readiness is scored" />
            </Tooltip>
          </span>
        </div>
        <div className="p-5">
          <p className="text-[15px] leading-relaxed text-muted">
            Baton read <N v={r.sources} /> sources (
            {parts.map(([n, label], i) => (
              <span key={label}>
                {i > 0 && ", "}
                <CountUp value={n} /> {label}
              </span>
            ))}
            {r.tools.length > 0 && <> from {r.tools.join(", ")}</>}) and found <N v={d.total} /> facts. <N v={d.grades.VERIFIED} /> are confirmed by 2+
            sources, <N v={d.openConflicts} /> {d.openConflicts === 1 ? "conflict needs" : "conflicts need"} a decision, <N v={missing} />{" "}
            {missing === 1 ? "thing" : "things"} nobody wrote down.
            {d.hiddenCount > 0 && <span className="text-subtle"> {d.hiddenCount} more are hidden at your access level.</span>}
          </p>
          <GradeBar grades={d.grades} height={8} className="mt-4" />
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-subtle">
            {GRADE_ORDER.map((g) => (
              <span key={g} className="inline-flex items-center gap-1.5">
                <span className="size-1.5 rounded-full" style={{ background: GRADE_COLOR[g] }} />
                {GRADE_LABEL[g]} <span className="font-mono text-muted">{d.grades[g]}</span> <Info text={GRADE_HELP[g]} />
              </span>
            ))}
          </div>
        </div>
      </Card>
    </section>
  );
}

function ReadinessRow({ label, weight, v }: { label: string; weight: number; v: number }) {
  return (
    <div className="flex justify-between gap-4 font-mono text-[11px]">
      <span className="font-sans text-muted">
        {label} × {weight}%
      </span>
      <span>
        {Math.round(v * 100)}% → {Math.round(v * weight)}
      </span>
    </div>
  );
}
