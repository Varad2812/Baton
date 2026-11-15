import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { DashboardData } from "@/lib/views/dashboard";
import { nextStep } from "@/lib/views/next-step";
import { Info } from "@/components/ui/info";
import { GRADE_COLOR, GRADE_HELP, GRADE_LABEL, GRADE_ORDER } from "@/lib/views/format";
import { CountUp } from "@/components/ui/count-up";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { GradeBar } from "@/components/common/grade-bar";
import { cn } from "@/lib/utils";

function N({ v }: { v: number }) {
  return <strong className="font-semibold text-text"><CountUp value={v} /></strong>;
}

/** First thing on the dashboard: what Baton read and found, in one sentence, then the next step. */
export function AnalysisSummary({
  d,
  slug,
  people,
}: {
  d: DashboardData;
  slug: string;
  people: { owner: string; successor: string };
}) {
  const r = d.read;
  const step = nextStep(
    { openConflicts: d.openConflicts, openQuestions: d.openGaps, versions: d.versions, slug },
    people,
  );
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
        <div className="flex items-center gap-2 border-b border-border px-5 py-2.5 text-xs">
          <span className="size-1.5 rounded-full bg-verified" />
          <span className="font-medium text-text">Analysis complete</span>
          <span className="text-subtle">· every number below is counted from the stored records</span>
        </div>
        <div className="grid grid-cols-[1fr_300px] gap-6 p-5">
          <div>
            <p className="text-[17px] leading-relaxed text-muted">
              Baton read <N v={r.sources} /> sources (
              {parts.map(([n, label], i) => (
                <span key={label}>
                  {i > 0 && ", "}
                  <CountUp value={n} /> {label}
                </span>
              ))}
              ) and found <N v={d.total} /> facts. <N v={d.grades.VERIFIED} /> are confirmed by 2+ sources,{" "}
              <N v={d.openConflicts} /> {d.openConflicts === 1 ? "conflict needs" : "conflicts need"} a decision,{" "}
              <N v={missing} /> {missing === 1 ? "thing" : "things"} nobody wrote down.
              {d.hiddenCount > 0 && (
                <span className="text-subtle"> {d.hiddenCount} more are hidden at your access level.</span>
              )}
            </p>
            <GradeBar grades={d.grades} height={10} className="mt-4" />
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-subtle">
              {GRADE_ORDER.map((g) => (
                <span key={g} className="inline-flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full" style={{ background: GRADE_COLOR[g] }} />
                  {GRADE_LABEL[g]} <span className="font-mono text-muted">{d.grades[g]}</span> <Info text={GRADE_HELP[g]} />
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-md border border-border bg-surface-2 p-3.5 text-[13px]">
            <div className="text-[11px] uppercase tracking-wide text-subtle">Before Baton</div>
            <p className="mt-1 text-muted">
              Knowledge scattered across <span className="font-mono text-text">{r.tools.length}</span> tools
              {r.tools.length > 0 && <> ({r.tools.join(", ")})</>}, with no way to tell what is still true.
            </p>
            <div className="mt-3 text-[11px] uppercase tracking-wide text-primary">After Baton</div>
            <p className="mt-1 text-muted">
              One handover where every fact cites its source and a reviewer has signed it off.
            </p>
          </div>
        </div>
      </Card>
      <div className="mt-3 flex items-center gap-4 rounded-lg border border-primary/30 bg-surface px-5 py-3.5">
        <Link
          href={step.href}
          data-try="next-step"
          className={cn(buttonVariants({ size: "lg" }), "h-11 px-5 text-[15px]")}
        >
          Next step: {step.label}
          <ArrowRight className="size-4" />
        </Link>
        <p className="text-[13px] text-muted">{step.reason}</p>
      </div>
    </section>
  );
}
