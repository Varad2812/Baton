"use client";

import { Dialog } from "@/components/ui/dialog";
import { GRADE_COLOR, GRADE_HELP, GRADE_LABEL, GRADE_ORDER } from "@/lib/views/format";

const TERMS: [string, string][] = [
  ["Fact", "One statement Baton extracted (a decision, task, risk, contact...), always with the quote it came from."],
  ["Evidence", "The exact quoted sentence, shown highlighted inside the original source. No match means no fact."],
  ["Conflict", "Two facts about the same topic that disagree. A reviewer picks one before approval."],
  ["Testimony", "An answer typed by the person leaving. Shown with a purple badge so it is never mistaken for a record."],
  ["Receipt", "The sign-off record of an approved version: who approved, when, and which sections were acknowledged."],
  ["Access level", "Public, Team or Restricted. People only see facts whose sources they are allowed to read."],
];

/** Grades and terms, opened from the Help menu. */
export function GlossaryDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Glossary" description="How facts are graded, and the words Baton uses." className="max-w-[480px]">
      <div className="text-[13px]" data-testid="glossary">
        <div className="mb-2 text-[11px] uppercase tracking-wide text-subtle">How facts are graded</div>
        <ul className="space-y-2">
          {GRADE_ORDER.map((g) => (
            <li key={g} className="flex gap-2">
              <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: GRADE_COLOR[g] }} />
              <span>
                <span className="font-medium text-text">{GRADE_LABEL[g]}.</span> <span className="text-muted">{GRADE_HELP[g]}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="mb-2 mt-4 text-[11px] uppercase tracking-wide text-subtle">Terms</div>
        <dl className="space-y-2">
          {TERMS.map(([t, d]) => (
            <div key={t}>
              <dt className="inline font-medium text-text">{t}. </dt>
              <dd className="inline text-muted">{d}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Dialog>
  );
}
