// Knowledge-at-risk radar (pure). Works before anyone resigns: every area of the project and every
// person gets a score from the records, and every finding comes with one concrete action.
//
// Areas
//   code area (services/x, apps/x): risk from owner concentration (top author's share of commits),
//     bus factor 1 and volume of work;
//   handover section: risk from what is still unknown or shaky in it (missing, conflicting,
//     inferred, one-source decisions, decisions with no written doc, stale tasks, secrets with no owner).
// People
//   knowledge concentration = how much of the project only this person knows (sole-owner code,
//   facts they own that rest on one source or none, secrets they mentioned), 0-100.
import type { Grade } from "@/generated/prisma/enums";

export type RadarClaim = {
  id: string;
  title: string;
  type: string;
  section: string;
  grade: Grade;
  status: string;
  date: string | null;
  owner: string | null;
  /** Source kinds of supporting evidence (DOC, CHAT, GITHUB_PR ...). */
  sourceKinds: string[];
  supports: number;
};

export type RadarArea = {
  key: string;
  label: string;
  kind: "code" | "section";
  commits?: number;
  topOwner?: { name: string; share: number };
  owners: { name: string; commits: number }[];
  busFactor?: number;
  lastCommit?: string;
  missing?: number;
  conflicting?: number;
  inferred?: number;
};

export type RiskItem = {
  id: string;
  kind: "single_owner" | "one_source_decision" | "no_written_doc" | "secret_no_owner" | "stale_task" | "missing" | "conflict";
  area: string;
  title: string;
  detail: string;
  /** 0-100 */
  severity: number;
  person: string | null;
  claimId: string | null;
  action: { kind: "ask_owner" | "open_fact" | "resolve" | "add_to_handover"; label: string };
};

export type ScoredArea = RadarArea & { risk: number; concentration: number; items: RiskItem[] };
export type PersonScore = { name: string; roleTitle: string; concentration: number; soleAreas: string[]; ownedFacts: number; weakFacts: number; secrets: number; first: RiskItem[] };

export type RadarInput = {
  owner: string;
  people: { name: string; roleTitle: string }[];
  areas: { area: string; commits: number; top: { name: string; commits: number; share: number }; others: { name: string; commits: number }[]; lastCommit: string; busFactor: number }[];
  claims: RadarClaim[];
  /** Secrets redacted in chunks the viewer may see: who mentioned them. */
  secrets: { mentionedBy: string | null; where: string }[];
  /** A credentials-owner fact exists (anything in Access & secrets that names who holds a secret). */
  credentialsOwnerKnown: boolean;
  /** Newest record date (YYYY-MM-DD), the "today" of the records. */
  asOf: string;
};

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86_400_000;
const short = (area: string) => area.split("/").pop() ?? area;

export function codeRisk(a: RadarInput["areas"][number]): number {
  const volume = Math.min(1, a.commits / 20);
  return clamp((a.busFactor === 1 ? 70 : 45) * a.top.share + 30 * volume);
}

export function scoreRadar(inp: RadarInput): { areas: ScoredArea[]; people: PersonScore[]; items: RiskItem[] } {
  const items: RiskItem[] = [];
  const first = (n: string | null) => (n ? n.split(" ")[0] : inp.owner.split(" ")[0]);
  const live = inp.claims.filter((c) => c.status !== "REJECTED");

  /* Code areas */
  const code: ScoredArea[] = inp.areas.map((a) => {
    const risk = codeRisk(a);
    const its: RiskItem[] = [];
    if (a.busFactor === 1 && a.commits >= 3) {
      its.push({
        id: `single_owner:${a.area}`,
        kind: "single_owner",
        area: a.area,
        title: `${short(a.area)}: only ${a.top.name} knows it`,
        detail: `${a.top.name} wrote ${a.top.commits} of ${a.commits} commits (bus factor 1). Last commit ${a.lastCommit}.`,
        severity: risk,
        person: a.top.name,
        claimId: null,
        action: { kind: "ask_owner", label: `Ask ${first(a.top.name)} to document ${short(a.area)}` },
      });
    }
    return {
      key: a.area,
      label: short(a.area),
      kind: "code",
      commits: a.commits,
      topOwner: { name: a.top.name, share: a.top.share },
      owners: [{ name: a.top.name, commits: a.top.commits }, ...a.others],
      busFactor: a.busFactor,
      lastCommit: a.lastCommit,
      risk,
      concentration: a.top.share,
      items: its,
    };
  });

  /* Handover sections */
  const bySection = new Map<string, RadarClaim[]>();
  for (const c of live) bySection.set(c.section, [...(bySection.get(c.section) ?? []), c]);
  const sections: ScoredArea[] = [];
  for (const [section, cs] of bySection) {
    const its: RiskItem[] = [];
    for (const c of cs) {
      if (c.grade === "MISSING") {
        its.push({ id: `missing:${c.id}`, kind: "missing", area: section, title: c.title, detail: "No record says this. Only the people who know can fill it in.", severity: 70, person: null, claimId: c.id, action: { kind: "ask_owner", label: `Ask ${first(inp.owner)}` } });
      } else if (c.grade === "CONFLICTING") {
        its.push({ id: `conflict:${c.id}`, kind: "conflict", area: section, title: c.title, detail: "Two sources disagree and nobody has decided which is right.", severity: 60, person: c.owner, claimId: c.id, action: { kind: "resolve", label: "Resolve the conflict" } });
      } else if (c.type === "DECISION" && c.supports === 1 && c.grade !== "VERIFIED") {
        its.push({ id: `one_source:${c.id}`, kind: "one_source_decision", area: section, title: c.title, detail: "A decision backed by a single record; nothing else confirms it.", severity: 40, person: c.owner, claimId: c.id, action: { kind: "ask_owner", label: `Ask ${first(c.owner)} to confirm it` } });
      } else if (c.type === "DECISION" && c.sourceKinds.length && c.sourceKinds.every((k) => k === "CHAT")) {
        its.push({ id: `no_doc:${c.id}`, kind: "no_written_doc", area: section, title: c.title, detail: "Decided in chat only: no notes, PR or doc records it.", severity: 35, person: c.owner, claimId: c.id, action: { kind: "ask_owner", label: `Ask ${first(c.owner)} to write it down` } });
      }
      if (c.type === "TASK" && c.grade !== "MISSING" && c.date && days(c.date, inp.asOf) > 21 && (!c.owner || /unassigned/i.test(c.title))) {
        its.push({ id: `stale:${c.id}`, kind: "stale_task", area: section, title: c.title, detail: `Open since ${c.date} with no owner.`, severity: 45, person: null, claimId: c.id, action: { kind: "add_to_handover", label: "Add to handover plan" } });
      }
    }
    const count = (g: Grade) => cs.filter((c) => c.grade === g).length;
    const risk = clamp(its.reduce((n, i) => n + i.severity * 0.45, 0));
    const owners = new Map<string, number>();
    for (const c of cs) if (c.owner) owners.set(c.owner, (owners.get(c.owner) ?? 0) + 1);
    const sorted = [...owners.entries()].sort((a, b) => b[1] - a[1]);
    const total = sorted.reduce((n, [, k]) => n + k, 0);
    sections.push({
      key: `section:${section}`,
      label: section,
      kind: "section",
      owners: sorted.map(([name, commits]) => ({ name, commits })),
      topOwner: sorted[0] ? { name: sorted[0][0], share: sorted[0][1] / total } : undefined,
      missing: count("MISSING"),
      conflicting: count("CONFLICTING"),
      inferred: count("INFERRED"),
      risk,
      concentration: sorted[0] ? sorted[0][1] / total : 0,
      items: its,
    });
  }

  /* Secrets with no recorded owner */
  if (inp.secrets.length && !inp.credentialsOwnerKnown) {
    const target = sections.find((s) => s.label === "Access & secrets") ?? sections[0];
    for (const [i, s] of inp.secrets.entries()) {
      const item: RiskItem = {
        id: `secret:${i}`,
        kind: "secret_no_owner",
        area: target?.label ?? "Access & secrets",
        title: `A secret was posted in ${s.where}${s.mentionedBy ? ` by ${s.mentionedBy}` : ""}`,
        detail: "Its value was redacted before storage, but no record says who owns or rotates it.",
        severity: 75,
        person: s.mentionedBy,
        claimId: null,
        action: { kind: "ask_owner", label: `Ask ${first(s.mentionedBy)} who owns it` },
      };
      target?.items.push(item);
      if (target) target.risk = clamp(target.risk + 20);
    }
  }

  const areas = [...code, ...sections].filter((a) => a.risk > 0 || a.kind === "code").sort((a, b) => b.risk - a.risk);
  for (const a of areas) items.push(...a.items);
  items.sort((a, b) => b.severity - a.severity);

  /* People */
  const people: PersonScore[] = inp.people.map((p) => {
    const sole = code.filter((a) => a.busFactor === 1 && a.topOwner?.name === p.name);
    const soleCommits = sole.reduce((n, a) => n + (a.commits ?? 0), 0);
    const allCommits = code.reduce((n, a) => n + (a.commits ?? 0), 0) || 1;
    const owned = live.filter((c) => c.owner === p.name);
    const weak = owned.filter((c) => c.grade === "INFERRED" || c.grade === "SINGLE_SOURCE" || c.grade === "MISSING");
    const secrets = inp.secrets.filter((s) => s.mentionedBy === p.name).length;
    const concentration = clamp(60 * (soleCommits / allCommits) + 25 * Math.min(1, weak.length / 6) + 15 * Math.min(1, secrets));
    const mine = items.filter((i) => i.person === p.name || (i.area && sole.some((a) => a.key === i.area)));
    return { name: p.name, roleTitle: p.roleTitle, concentration, soleAreas: sole.map((a) => a.label), ownedFacts: owned.length, weakFacts: weak.length, secrets, first: mine.slice(0, 3) };
  });
  people.sort((a, b) => b.concentration - a.concentration);

  return { areas, people, items };
}
