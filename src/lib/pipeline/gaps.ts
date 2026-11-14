// Gaps stage. Pure: the 12-item checklist, single-owner detection from commit history,
// MISSING claim construction. LLM: specificGaps() names concrete facts nobody wrote down.

import { z } from "zod";
import type { ClaimType } from "@/generated/prisma/enums";
import { llmJson, LlmInvalidOutputError, type LlmRunCtx } from "@/lib/llm";
import { CHECKLIST, CHECKLIST_KEYS, checklistItem, type ChecklistItem } from "./checklist";
import { slugKey, type IdGen } from "./ids";
import type { PChunk, PClaim, PEvidence, PPerson, PSource } from "./types";
import { personResolver } from "./validate";

const MEETS: ReadonlySet<string> = new Set(["VERIFIED", "SINGLE_SOURCE", "CONFLICTING"]);

export type ChecklistResult = { key: string; item: ChecklistItem; met: boolean; claimIds: string[] }[];

/**
 * An item is met when a non-rejected claim backed by real evidence (not an inference, not a gap)
 * is tagged with it. Claims without any checklist tags (e.g. older cached data) fall back to
 * matching the item's section.
 */
export function runChecklist(claims: PClaim[]): ChecklistResult {
  const live = claims.filter((c) => c.status !== "REJECTED" && MEETS.has(c.grade) && !c.topicKey.startsWith("gap:"));
  const anyTags = live.some((c) => c.checklistKeys.length > 0);
  return CHECKLIST.map((item) => {
    const hits = live.filter((c) =>
      anyTags ? c.checklistKeys.includes(item.key) : c.section === item.section,
    );
    return { key: item.key, item, met: hits.length > 0, claimIds: hits.map((c) => c.id) };
  });
}

const GAP_TYPE: Record<string, ClaimType> = {
  credentials_owner: "RISK",
  production_access: "RISK",
  key_contacts: "CONTACT",
  review_approval: "CONTACT",
  external_dependencies: "DEPENDENCY",
  open_work: "TASK",
  upcoming_deadlines: "TASK",
};

export type GapSpec = {
  checklistKey: string;
  topicKey: string;
  title: string;
  statement: string;
  reason?: string;
};

export function gapClaim(spec: GapSpec, ids: IdGen): PClaim {
  const item = checklistItem(spec.checklistKey);
  const label = item?.label ?? spec.checklistKey;
  return {
    id: ids("clm"),
    type: GAP_TYPE[spec.checklistKey] ?? "QUESTION",
    section: item?.section ?? "Risks",
    title: spec.title,
    statement: spec.statement,
    topicKey: spec.topicKey.startsWith("gap:") ? spec.topicKey : `gap:${spec.topicKey}`,
    ownerPersonId: null,
    date: null,
    grade: "MISSING",
    gradeReason: `Checklist: ${label}. 0 records${spec.reason ? `; ${spec.reason}` : ""}`,
    status: "DRAFT",
    access: "TEAM",
    fromTestimony: false,
    isInference: false,
    reviewerNote: null,
    checklistKeys: [spec.checklistKey],
    evidence: [],
  };
}

export function genericGap(item: ChecklistItem): GapSpec {
  return {
    checklistKey: item.key,
    topicKey: `gap:${item.key}`,
    title: `No record: ${item.label.toLowerCase()}`,
    statement: `No source states ${item.satisfiedBy}.`,
  };
}

/* ------------------------------------------------------------------------- */
/* Single owner (deterministic, from commit chunks)                            */
/* ------------------------------------------------------------------------- */

export type SingleOwnerArea = {
  area: string;
  topicKey: string;
  person: PPerson;
  commits: number;
  total: number;
  quotes: { chunkId: string; quote: string }[];
};

const HEADER = /^([0-9a-f]{7}) · (\d{4}-\d{2}-\d{2}) · (.+?)(?: \(@([^)]+)\))?$/;

function areaOf(file: string): string | null {
  const parts = file.split("/");
  if (parts.length < 2) return null;
  if (["services", "packages", "apps", "libs", "modules"].includes(parts[0]) && parts.length >= 3) {
    return `${parts[0]}/${parts[1]}`;
  }
  return parts[0];
}

export function singleOwnerAreas(
  chunks: PChunk[],
  sources: PSource[],
  people: PPerson[],
  opts: { minCommits?: number; minShare?: number } = {},
): SingleOwnerArea[] {
  const minCommits = opts.minCommits ?? 10;
  const minShare = opts.minShare ?? 0.9;
  const resolve = personResolver(people);
  const commitSources = new Set(sources.filter((s) => s.kind === "GITHUB_COMMIT").map((s) => s.id));
  type Commit = { chunkId: string; header: string; author: string; files: string[] };
  const commits: Commit[] = [];
  for (const c of chunks) {
    if (!commitSources.has(c.sourceId)) continue;
    let cur: Commit | null = null;
    for (const line of c.text.split("\n")) {
      const h = line.match(HEADER);
      if (h) {
        cur = { chunkId: c.id, header: line, author: h[4] ?? h[3], files: [] };
        commits.push(cur);
      } else if (cur && line.startsWith("files: ")) {
        cur.files.push(...line.slice(7).split(", ").map((f) => f.trim()).filter(Boolean));
      }
    }
  }

  const byArea = new Map<string, Commit[]>();
  for (const cm of commits) {
    const areas = new Set(cm.files.map(areaOf).filter((x): x is string => !!x));
    // Repo-wide scaffolding (e.g. "initial monorepo") says nothing about who maintains an area.
    if (areas.size >= 4) continue;
    for (const a of areas) {
      const l = byArea.get(a) ?? [];
      l.push(cm);
      byArea.set(a, l);
    }
  }

  const out: SingleOwnerArea[] = [];
  for (const [area, list] of byArea) {
    if (list.length < minCommits) continue;
    const counts = new Map<string, { person: PPerson; n: number; commits: Commit[] }>();
    for (const cm of list) {
      const p = resolve(cm.author);
      if (!p) continue;
      const e = counts.get(p.id) ?? { person: p, n: 0, commits: [] };
      e.n++;
      e.commits.push(cm);
      counts.set(p.id, e);
    }
    const top = [...counts.values()].sort((a, b) => b.n - a.n)[0];
    if (!top || top.n / list.length < minShare) continue;
    const seenChunks = new Set<string>();
    const quotes: { chunkId: string; quote: string }[] = [];
    for (const cm of top.commits) {
      if (seenChunks.has(cm.chunkId) || quotes.length >= 3) continue;
      seenChunks.add(cm.chunkId);
      quotes.push({ chunkId: cm.chunkId, quote: cm.header });
    }
    const last = area.split("/").pop() ?? area;
    out.push({ area, topicKey: `${slugKey(last)}_owner`, person: top.person, commits: top.n, total: list.length, quotes });
  }
  return out.sort((a, b) => b.commits - a.commits);
}

export function singleOwnerClaim(a: SingleOwnerArea, chunks: Map<string, PChunk>, ids: IdGen): PClaim {
  const evidence: PEvidence[] = [];
  for (const q of a.quotes) {
    const ch = chunks.get(q.chunkId);
    const at = ch?.text.indexOf(q.quote) ?? -1;
    if (!ch || at < 0) continue;
    evidence.push({ id: ids("ev"), chunkId: ch.id, quote: q.quote, relation: "SUPPORTS", quoteValid: true, matchStart: at, matchEnd: at + q.quote.length });
  }
  return {
    id: ids("clm"),
    type: "RISK",
    section: "Risks",
    title: `${a.area} has a single maintainer (${a.person.name}, ${a.commits} of ${a.total} commits)`,
    statement: `${a.person.name} wrote ${a.commits} of the ${a.total} commits touching ${a.area}. No record names anyone else who can build or change it.`,
    topicKey: a.topicKey,
    ownerPersonId: a.person.id,
    date: null,
    grade: "INFERRED",
    gradeReason: "",
    status: "DRAFT",
    access: "TEAM",
    fromTestimony: false,
    isInference: true,
    reviewerNote: null,
    checklistKeys: ["open_work"],
    evidence,
  };
}

/* ------------------------------------------------------------------------- */
/* LLM: specific gaps                                                         */
/* ------------------------------------------------------------------------- */

export const SpecificGapsSchema = z.object({
  gaps: z
    .array(
      z.object({
        checklistKey: z.enum(CHECKLIST_KEYS),
        topicKey: z.string().describe("snake_case key, e.g. domain_registrar"),
        title: z.string().describe("the missing fact phrased as what is unknown, e.g. 'Who holds the production database password'"),
        statement: z.string().describe("one sentence: what no record states and why the successor needs it"),
        reason: z.string().describe("what in the records shows this fact exists but is never written down"),
      }),
    )
    .max(6),
});

const GAPS_SYSTEM = `You audit a handover ledger for what is MISSING. Given the checklist status and the
claims extracted from the records, name up to 6 concrete facts the successor will need that no claim
states, where the records show the thing exists (an account, a credential, a contact, a procedure) but
never say who owns it, where it is, or how it is done. Be specific (name the service or account).
Do not repeat facts that a listed claim already states.`;

export async function specificGaps(
  checklist: ChecklistResult,
  claims: PClaim[],
  ctx: LlmRunCtx,
): Promise<GapSpec[]> {
  const status = checklist.map((c) => `- ${c.key} (${c.item.label}): ${c.met ? `met by ${c.claimIds.length} claims` : "NOT MET"}`).join("\n");
  const list = claims
    .filter((c) => c.status !== "REJECTED")
    .slice(0, 220)
    .map((c) => `- [${c.type}/${c.grade}] ${c.title}`)
    .join("\n");
  try {
    const out = await llmJson(
      {
        name: "gaps:specific",
        system: GAPS_SYSTEM,
        prompt: `Checklist status:\n${status}\n\nClaims:\n${list}\n\nList the specific missing facts.`,
        schema: SpecificGapsSchema,
        temperature: 0.2,
      },
      ctx,
    );
    return out.gaps.map((g) => ({
      checklistKey: g.checklistKey,
      topicKey: `gap:${slugKey(g.topicKey).replace(/^gap:/, "")}`,
      title: g.title.trim().replace(/\?$/, ""),
      statement: g.statement.trim(),
      reason: g.reason.trim(),
    }));
  } catch (e) {
    if (e instanceof LlmInvalidOutputError) return [];
    throw e;
  }
}

/**
 * Final gap set: specific gaps first; a generic "No record: X" gap only for unmet items
 * that no specific gap already covers. Dedupe by topicKey.
 */
export function buildGapClaims(checklist: ChecklistResult, specific: GapSpec[], ids: IdGen): PClaim[] {
  const covered = new Set(specific.map((s) => s.checklistKey));
  const specs = [
    ...specific,
    ...checklist.filter((c) => !c.met && !covered.has(c.key)).map((c) => genericGap(c.item)),
  ];
  const seen = new Set<string>();
  return specs
    .filter((s) => (seen.has(s.topicKey) ? false : (seen.add(s.topicKey), true)))
    .map((s) => gapClaim(s, ids));
}
