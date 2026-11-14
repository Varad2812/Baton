// Builds seed/pipeline-cache.json from the fixtures + hand-authored claims.
//   npm run seed:build-cache
// Chunking/redaction is deterministic (src/lib/pipeline/normalise.ts); every evidence
// quote is resolved to the exact chunk that contains it, or the build fails.

import { writeFileSync } from "node:fs";
import path from "node:path";
import type { Access } from "../src/generated/prisma/enums";
import { normaliseSources, type RawSource } from "../src/lib/pipeline/normalise";
import { findQuote } from "../src/lib/pipeline/quotes";
import {
  AUDIT,
  CLAIMS,
  CONFLICTS,
  GAP_QUESTIONS,
  TESTIMONY_CLAIMS,
  type ClaimSpec,
} from "./cache-src/claims";
import { SEED_DIR, loadFestflowSources, loadPeople } from "./lib/festflow-sources";

const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const RANK: Record<Access, number> = { PUBLIC: 0, TEAM: 1, RESTRICTED: 2 };
const fail = (msg: string): never => {
  console.error(`build-cache: ${msg}`);
  process.exit(1);
};

const people = loadPeople();
const personId = (k: string) => `per_${k}`;
const personByKey = new Map(people.map((p) => [p.key, p]));

/* 1. Sources: fixtures + testimony from answered gap questions */
const raw: RawSource[] = loadFestflowSources();
GAP_QUESTIONS.forEach((g, i) => {
  if (!g.answer) return;
  const at = new Date(g.answer.at);
  const day = at.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
  raw.push({
    key: `src_testimony_${g.id}`,
    kind: "TESTIMONY",
    title: `Exit interview · Q${i + 1} answered by Meera Kulkarni`,
    access: "TEAM",
    authoritative: false,
    author: "meera-k",
    createdAt: at,
    mergeItems: false,
    items: [
      {
        text: `Q${i + 1}: ${g.question}\nA (Meera Kulkarni, ${day}): ${g.answer.text}`,
        locator: `interview Q${i + 1}`,
        author: "meera-k",
        timestamp: at,
      },
    ],
  });
});

/* 2. Normalise: chunk + redact + identity map */
const { chunks, identityHits } = normaliseSources(raw, people);
const chunksBySource = new Map<string, typeof chunks>();
for (const c of chunks) {
  const list = chunksBySource.get(c.sourceKey) ?? [];
  list.push(c);
  chunksBySource.set(c.sourceKey, list);
}
const sourceByKey = new Map(raw.map((s) => [s.key, s]));

/* 3. Claims + evidence */
const allClaims: ClaimSpec[] = [...CLAIMS, ...TESTIMONY_CLAIMS];
const ids = new Set<string>();
for (const c of allClaims) {
  if (ids.has(c.id)) fail(`duplicate claim id ${c.id}`);
  ids.add(c.id);
}

let evN = 0;
const evidence: {
  id: string;
  claimId: string;
  chunkId: string;
  quote: string;
  relation: "SUPPORTS" | "CONTRADICTS";
  quoteValid: boolean;
  matchStart: number;
  matchEnd: number;
}[] = [];

const claims = allClaims.map((c) => {
  const accesses: Access[] = [];
  for (const e of c.evidence) {
    const src = sourceByKey.get(e.source) ?? fail(`claim ${c.id}: unknown source ${e.source}`);
    const candidates = chunksBySource.get(e.source) ?? [];
    let hit: { chunk: (typeof chunks)[number]; start: number; end: number } | null = null;
    for (const ch of candidates) {
      const m = findQuote(ch.text, e.quote);
      if (m) {
        hit = { chunk: ch, ...m };
        break;
      }
    }
    if (!hit) fail(`claim ${c.id}: quote not found in ${e.source}: "${e.quote}"`);
    const h = hit!;
    accesses.push(src.access);
    evidence.push({
      id: `ev_${String(++evN).padStart(3, "0")}`,
      claimId: c.id,
      chunkId: h.chunk.id,
      // Store the exact chunk substring so the quote is byte-identical to the chunk.
      quote: h.chunk.text.slice(h.start, h.end),
      relation: e.relation ?? "SUPPORTS",
      quoteValid: true,
      matchStart: h.start,
      matchEnd: h.end,
    });
  }
  if (c.owner && !personByKey.has(c.owner)) fail(`claim ${c.id}: unknown owner ${c.owner}`);
  const access = accesses.length
    ? accesses.reduce((m, a) => (RANK[a] > RANK[m] ? a : m), "PUBLIC" as Access)
    : ("TEAM" as Access);
  return {
    id: c.id,
    type: c.type,
    section: c.section,
    title: c.title,
    statement: c.statement,
    topicKey: c.topicKey,
    ownerPersonId: c.owner ? personId(c.owner) : null,
    date: c.date ?? null,
    grade: c.grade,
    gradeReason: c.gradeReason,
    status: c.status ?? "DRAFT",
    access,
    fromTestimony: !!c.fromTestimony,
    isInference: !!c.isInference,
    reviewerNote: c.reviewerNote ?? null,
  };
});

/* 4. Conflicts, gap questions */
for (const cf of CONFLICTS) {
  if (!ids.has(cf.a) || !ids.has(cf.b)) fail(`conflict ${cf.id}: unknown claim`);
}
const conflicts = CONFLICTS.map((cf) => ({
  id: cf.id,
  topicKey: cf.topicKey,
  claimAId: cf.a,
  claimBId: cf.b,
  kind: cf.kind,
  status: cf.status,
  resolution: cf.resolution ?? null,
  note: cf.note ?? null,
}));

const gapQuestions = GAP_QUESTIONS.map((g) => {
  if (g.relatedClaim && !ids.has(g.relatedClaim)) fail(`gap ${g.id}: unknown claim ${g.relatedClaim}`);
  return {
    id: g.id,
    kind: g.kind,
    question: g.question,
    rationale: g.rationale,
    priority: g.priority,
    relatedClaimId: g.relatedClaim ?? null,
    checklistKey: g.checklistKey ?? null,
    answer: g.answer?.text ?? null,
    answeredAt: g.answer?.at ?? null,
    testimonySourceId: g.answer ? `src_testimony_${g.id}` : null,
  };
});

/* 5. Stats + pipeline run */
const count = <T extends string>(xs: T[]) =>
  xs.reduce<Record<string, number>>((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {});
const redactions = chunks.flatMap((c) =>
  c.redactions.map((r) => ({ ...r, chunkId: c.id })),
);
const stats = {
  sources: raw.length,
  chunks: chunks.length,
  redactions: count(redactions.map((r) => r.kind)),
  claims: claims.length,
  claimsByGrade: count(claims.map((c) => c.grade)),
  claimsByType: count(claims.map((c) => c.type)),
  claimsByAccess: count(claims.map((c) => c.access)),
  evidence: evidence.length,
  conflictsOpen: conflicts.filter((c) => c.kind === "CONTRADICTS").length,
  supersessions: conflicts.filter((c) => c.kind === "SUPERSEDES").length,
  gapQuestions: gapQuestions.length,
  gapAnswered: gapQuestions.filter((g) => g.answer).length,
  identityHandlesResolved: identityHits.size,
};

const started = new Date("2026-04-22T18:09:00+05:30");
const stageMs = { ingest: 412, normalise: 186, extract: 9840, validate: 41, grade: 18, conflicts: 2210, gaps: 25, questions: 1630 };
const pipelineRun = {
  id: "run_seed",
  mode: "CACHED",
  status: "SUCCEEDED",
  model: MODEL,
  startedAt: started.toISOString(),
  finishedAt: new Date(started.getTime() + Object.values(stageMs).reduce((a, b) => a + b, 0)).toISOString(),
  error: null,
  stages: [
    { stage: "ingest", status: "done", ms: stageMs.ingest, counts: { sources: raw.length - stats.gapAnswered } },
    { stage: "normalise", status: "done", ms: stageMs.normalise, counts: { chunks: chunks.length, redactions: redactions.length, people: people.length } },
    { stage: "extract", status: "done", ms: stageMs.extract, counts: { claims: claims.length - (stats.claimsByGrade.MISSING ?? 0) + 4 } },
    { stage: "validate", status: "done", ms: stageMs.validate, counts: { quotes: evidence.length, valid: evidence.length, dropped: 0, claimsDiscarded: 4 } },
    { stage: "grade", status: "done", ms: stageMs.grade, counts: stats.claimsByGrade },
    { stage: "conflicts", status: "done", ms: stageMs.conflicts, counts: { contradicts: stats.conflictsOpen, supersedes: stats.supersessions } },
    { stage: "gaps", status: "done", ms: stageMs.gaps, counts: { checklist: 12, missing: stats.claimsByGrade.MISSING ?? 0 } },
    { stage: "questions", status: "done", ms: stageMs.questions, counts: { questions: gapQuestions.length } },
  ],
};

/* 6. Write */
const cache = {
  version: 1,
  generator: "hand-authored (seed/cache-src/claims.ts) + deterministic normalise",
  model: MODEL,
  project: {
    id: "prj_festflow",
    slug: "festflow",
    name: "FestFlow",
    description:
      "Registration and ticketing web app for Kalrav 2026, the cultural fest of VCE Pune. Handover from Meera Kulkarni (graduating) to Arjun Mehta.",
    createdAt: "2026-04-22T18:02:00+05:30",
  },
  people: people.map((p) => ({
    id: personId(p.key),
    key: p.key,
    name: p.name,
    roleTitle: p.roleTitle ?? "",
    email: p.email ?? null,
    handles: p.handles,
  })),
  sources: raw.map((s) => ({
    id: s.key,
    kind: s.kind,
    title: s.title,
    uri: s.uri ?? null,
    access: s.access,
    authoritative: s.authoritative,
    author: s.author ? (people.find((p) => p.handles.includes(s.author!))?.name ?? s.author) : null,
    createdAt: s.createdAt.toISOString(),
    grantedToIncoming: !!s.grantedToIncoming,
  })),
  chunks: chunks.map((c) => ({
    id: c.id,
    sourceId: c.sourceKey,
    ordinal: c.ordinal,
    text: c.text,
    locator: c.locator,
    author: c.author,
    timestamp: c.timestamp,
    access: c.access,
  })),
  redactions: redactions.map((r) => ({
    id: r.id,
    chunkId: r.chunkId,
    kind: r.kind,
    placeholder: r.placeholder,
    mentionedBy: r.mentionedBy,
  })),
  claims,
  evidence,
  conflicts,
  gapQuestions,
  handover: {
    id: "ho_festflow",
    fromPersonId: personId("meera"),
    toPersonId: personId("arjun"),
    reviewerPersonId: personId("rao"),
    status: "IN_REVIEW",
    currentVersion: 0,
  },
  auditLogs: AUDIT.map((a, i) => ({
    id: `aud_${String(i + 1).padStart(3, "0")}`,
    actorName: a.actor === "system" ? "System" : personByKey.get(a.actor)!.name,
    actorRole: a.role,
    action: a.action,
    targetType: a.targetType,
    targetId: a.targetId ?? null,
    meta: a.meta ?? {},
    at: new Date(a.at).toISOString(),
  })),
  pipelineRun,
  stats,
};

const out = path.join(SEED_DIR, "pipeline-cache.json");
writeFileSync(out, JSON.stringify(cache, null, 2) + "\n");
console.log(`build-cache: wrote ${path.relative(process.cwd(), out)}`);
console.log(JSON.stringify(stats, null, 2));
