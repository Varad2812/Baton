// Version diff (pure): what changed between two handover snapshots (or a version and the draft).
import type { Snapshot, SnapshotClaim } from "./compile";

export type ClaimRef = Pick<SnapshotClaim, "id" | "title" | "section" | "grade" | "access">;
export type FieldChange = { field: "title" | "statement" | "grade" | "status" | "section" | "evidence"; from: string; to: string };
export type ClaimChange = { claim: ClaimRef; changes: FieldChange[] };
export type ConflictChange = { id: string; topicKey: string; from: string; to: string; resolution: string | null };

export type SnapshotDiff = {
  added: ClaimRef[];
  removed: ClaimRef[];
  changed: ClaimChange[];
  conflicts: ConflictChange[];
  answered: { id: string; question: string }[];
  unchanged: number;
};

const liveStatus = (s: string) => (s === "REJECTED" ? "REJECTED" : "live");

const ref = (c: SnapshotClaim): ClaimRef => ({ id: c.id, title: c.title, section: c.section, grade: c.grade, access: c.access });

export function diffSnapshots(before: Pick<Snapshot, "claims" | "conflicts" | "answeredQuestions">, after: Pick<Snapshot, "claims" | "conflicts" | "answeredQuestions">): SnapshotDiff {
  const a = new Map(before.claims.map((c) => [c.id, c]));
  const b = new Map(after.claims.map((c) => [c.id, c]));
  const added = after.claims.filter((c) => !a.has(c.id)).map(ref);
  const removed = before.claims.filter((c) => !b.has(c.id)).map(ref);
  const changed: ClaimChange[] = [];
  let unchanged = 0;
  for (const [id, x] of a) {
    const y = b.get(id);
    if (!y) continue;
    const changes: FieldChange[] = [];
    for (const f of ["title", "statement", "grade", "status", "section"] as const) {
      // Approving a version flips every live claim DRAFT/EDITED -> APPROVED. That is bookkeeping, not a
      // change to the handover, so only rejected <-> live counts as a status change.
      const [from, to] = f === "status" ? [liveStatus(x.status), liveStatus(y.status)] : [x[f], y[f]];
      if (from !== to) changes.push({ field: f, from: String(from), to: String(to) });
    }
    const ex = x.evidence.length;
    const ey = y.evidence.length;
    if (ex !== ey) changes.push({ field: "evidence", from: `${ex} quote${ex === 1 ? "" : "s"}`, to: `${ey} quote${ey === 1 ? "" : "s"}` });
    if (changes.length) changed.push({ claim: ref(y), changes });
    else unchanged++;
  }
  const ca = new Map(before.conflicts.map((c) => [c.id, c]));
  const conflicts: ConflictChange[] = after.conflicts
    .filter((c) => c.kind === "CONTRADICTS")
    .flatMap((c) => {
      const prev = ca.get(c.id);
      const from = prev ? prev.status : "NEW";
      return from !== c.status ? [{ id: c.id, topicKey: c.topicKey, from, to: c.status, resolution: c.resolution }] : [];
    });
  const answeredBefore = new Set(before.answeredQuestions.map((q) => q.id));
  const answered = after.answeredQuestions.filter((q) => !answeredBefore.has(q.id)).map((q) => ({ id: q.id, question: q.question }));
  return { added, removed, changed, conflicts, answered, unchanged };
}

export function diffIsEmpty(d: SnapshotDiff): boolean {
  return !d.added.length && !d.removed.length && !d.changed.length && !d.conflicts.length && !d.answered.length;
}
