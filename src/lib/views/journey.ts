// Done / current / todo for each numbered step of the handover journey (the dots in the sidebar).
import type { GroupKey } from "@/components/shell/nav";

export type JourneyState = "done" | "current" | "todo";
export type JourneyInput = {
  sources: number;
  /** The last pipeline run succeeded (facts exist). */
  analysed: boolean;
  openConflicts: number;
  openGaps: number;
  /** At least one approved version exists. */
  approved: boolean;
  /** Records changed since the approved version (the approval is out of date). */
  changes?: number;
};

const ORDER: Exclude<GroupKey, "overview">[] = ["collect", "understand", "gaps", "approve", "handover"];

/** Every step is either done, the first not-done step ("current"), or still to do. */
export function journeyState(s: JourneyInput): Record<Exclude<GroupKey, "overview">, JourneyState> {
  const done: Record<(typeof ORDER)[number], boolean> = {
    collect: s.sources > 0,
    understand: s.analysed && s.openConflicts === 0,
    gaps: s.analysed && s.openGaps === 0,
    approve: s.approved && !s.changes,
    handover: s.approved,
  };
  let current = false;
  const out = {} as Record<(typeof ORDER)[number], JourneyState>;
  for (const k of ORDER) {
    if (done[k]) out[k] = "done";
    else if (!current) {
      out[k] = "current";
      current = true;
    } else out[k] = "todo";
  }
  return out;
}
