// Change detection after approval (pure): what happened to the project's knowledge since an approved
// version, at one viewer's access level.
//   new          a fact that is not in the approved version
//   contradicted an approved fact now in an open contradiction that did not exist at approval
//   outdated     an approved fact superseded by a later one (SUPERSEDES recorded after approval)
//   confirmed    an approved fact that gained a new independent source
import { canSeeClaim, type AllowedAccess } from "@/lib/authz";
import type { Snapshot, SnapshotClaim } from "./compile";

export type ChangeRef = { id: string; title: string; section: string; grade: string };
export type ChangeSet = {
  version: number;
  newFacts: ChangeRef[];
  contradicted: { claim: ChangeRef; by: ChangeRef }[];
  outdated: { claim: ChangeRef; by: ChangeRef }[];
  confirmed: ChangeRef[];
  total: number;
  /** Ids of every fact involved (the review page shows only these). */
  ids: string[];
};

type Snap = Pick<Snapshot, "claims" | "conflicts">;

const ref = (c: SnapshotClaim): ChangeRef => ({ id: c.id, title: c.title, section: c.section, grade: c.grade });
const sources = (c: SnapshotClaim) => new Set(c.evidence.filter((e) => e.relation === "SUPPORTS").map((e) => e.sourceId)).size;

export function visibleTo(allowed: AllowedAccess, s: Snap): Snap {
  const claims = s.claims.filter((c) =>
    canSeeClaim(allowed, { access: c.access, evidence: c.evidence.map((e) => ({ chunk: { access: e.access, sourceId: e.sourceId } })) }),
  );
  const ids = new Set(claims.map((c) => c.id));
  return { claims, conflicts: s.conflicts.filter((c) => ids.has(c.claimAId) && ids.has(c.claimBId)) };
}

export function classifyChanges(approved: Snap, current: Snap, version: number): ChangeSet {
  const before = new Map(approved.claims.map((c) => [c.id, c]));
  const now = new Map(current.claims.map((c) => [c.id, c]));
  const known = new Set(approved.conflicts.map((c) => c.id));

  const newFacts = current.claims.filter((c) => !before.has(c.id)).map(ref);
  const contradicted: ChangeSet["contradicted"] = [];
  const outdated: ChangeSet["outdated"] = [];
  for (const cf of current.conflicts) {
    if (known.has(cf.id)) continue;
    const a = now.get(cf.claimAId);
    const b = now.get(cf.claimBId);
    if (!a || !b) continue;
    if (cf.kind === "CONTRADICTS" && cf.status === "OPEN") {
      const [old, by] = before.has(a.id) ? [a, b] : before.has(b.id) ? [b, a] : [null, null];
      if (old && by) contradicted.push({ claim: ref(before.get(old.id)!), by: ref(by) });
    } else if (cf.kind === "SUPERSEDES" && before.has(a.id)) {
      outdated.push({ claim: ref(before.get(a.id)!), by: ref(b) });
    }
  }
  const touched = new Set([...contradicted.map((x) => x.claim.id), ...outdated.map((x) => x.claim.id)]);
  const confirmed = current.claims
    .filter((c) => before.has(c.id) && !touched.has(c.id) && sources(c) > sources(before.get(c.id)!))
    .map(ref);

  const ids = [
    ...new Set([
      ...newFacts.map((x) => x.id),
      ...contradicted.flatMap((x) => [x.claim.id, x.by.id]),
      ...outdated.flatMap((x) => [x.claim.id, x.by.id]),
      ...confirmed.map((x) => x.id),
    ]),
  ];
  return { version, newFacts, contradicted, outdated, confirmed, total: newFacts.length + contradicted.length + outdated.length + confirmed.length, ids };
}

/** "4 new facts, 1 contradiction" (empty string when nothing changed). */
export function changeSummary(c: Pick<ChangeSet, "newFacts" | "contradicted" | "outdated" | "confirmed">): string {
  const n = (k: number, one: string, many: string) => (k ? `${k} ${k === 1 ? one : many}` : null);
  return [
    n(c.newFacts.length, "new fact", "new facts"),
    n(c.contradicted.length, "contradiction", "contradictions"),
    n(c.outdated.length, "outdated fact", "outdated facts"),
    n(c.confirmed.length, "newly confirmed", "newly confirmed"),
  ]
    .filter(Boolean)
    .join(", ");
}
