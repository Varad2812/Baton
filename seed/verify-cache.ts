// Independent checks on seed/pipeline-cache.json.   npm run seed:verify
// - every quote is an exact substring of its chunk (and matches stored offsets)
// - referential integrity, grade rules, redaction + canary hygiene, coverage

import { readFileSync } from "node:fs";
import path from "node:path";
import { quoteIsValid } from "../src/lib/pipeline/quotes";

type Cache = {
  people: { id: string }[];
  sources: { id: string; kind: string; access: string; authoritative: boolean }[];
  chunks: { id: string; sourceId: string; text: string; access: string }[];
  redactions: { id: string; chunkId: string; placeholder: string }[];
  claims: {
    id: string;
    type: string;
    grade: string;
    access: string;
    topicKey: string;
    ownerPersonId: string | null;
    isInference: boolean;
    fromTestimony: boolean;
  }[];
  evidence: {
    id: string;
    claimId: string;
    chunkId: string;
    quote: string;
    relation: string;
    quoteValid: boolean;
    matchStart: number;
    matchEnd: number;
  }[];
  conflicts: { id: string; claimAId: string; claimBId: string; kind: string; status: string }[];
  gapQuestions: { id: string; kind: string; relatedClaimId: string | null; testimonySourceId: string | null; answer: string | null }[];
  handover: { fromPersonId: string; toPersonId: string; reviewerPersonId: string; status: string };
};

const dir = path.resolve(__dirname);
const cache = JSON.parse(readFileSync(process.argv[2] ?? path.join(dir, "pipeline-cache.json"), "utf8")) as Cache;
const truth = JSON.parse(readFileSync(path.join(dir, "ground-truth.json"), "utf8"));

const errors: string[] = [];
const check = (ok: unknown, msg: string) => {
  if (!ok) errors.push(msg);
};

const sources = new Map(cache.sources.map((s) => [s.id, s]));
const chunks = new Map(cache.chunks.map((c) => [c.id, c]));
const claims = new Map(cache.claims.map((c) => [c.id, c]));
const people = new Set(cache.people.map((p) => p.id));
const RANK: Record<string, number> = { PUBLIC: 0, TEAM: 1, RESTRICTED: 2 };

/* Unique ids */
for (const [name, list] of Object.entries({
  sources: cache.sources,
  chunks: cache.chunks,
  claims: cache.claims,
  evidence: cache.evidence,
  redactions: cache.redactions,
})) {
  const ids = (list as { id: string }[]).map((x) => x.id);
  check(new Set(ids).size === ids.length, `${name}: duplicate ids`);
}

/* Chunks */
for (const c of cache.chunks) {
  const s = sources.get(c.sourceId);
  check(s, `chunk ${c.id}: unknown source ${c.sourceId}`);
  check(s && s.access === c.access, `chunk ${c.id}: access ${c.access} not inherited from source`);
}

/* Evidence: exact substring at stored offsets */
let quotesChecked = 0;
for (const e of cache.evidence) {
  quotesChecked++;
  const ch = chunks.get(e.chunkId);
  check(claims.has(e.claimId), `evidence ${e.id}: unknown claim ${e.claimId}`);
  if (!ch) {
    errors.push(`evidence ${e.id}: unknown chunk ${e.chunkId}`);
    continue;
  }
  check(e.quoteValid === true, `evidence ${e.id}: quoteValid is false`);
  check(ch.text.includes(e.quote), `evidence ${e.id}: quote is not an exact substring of ${e.chunkId}: "${e.quote}"`);
  check(
    ch.text.slice(e.matchStart, e.matchEnd) === e.quote,
    `evidence ${e.id}: offsets ${e.matchStart}-${e.matchEnd} do not match the quote`,
  );
  check(quoteIsValid(ch.text, e.quote), `evidence ${e.id}: normalised match failed`);
}

/* Claims: grade rules + access */
const evByClaim = new Map<string, Cache["evidence"]>();
for (const e of cache.evidence) {
  const l = evByClaim.get(e.claimId) ?? [];
  l.push(e);
  evByClaim.set(e.claimId, l);
}
const openConflictClaims = new Set(
  cache.conflicts
    .filter((c) => c.kind === "CONTRADICTS" && c.status === "OPEN")
    .flatMap((c) => [c.claimAId, c.claimBId]),
);

for (const c of cache.claims) {
  const ev = evByClaim.get(c.id) ?? [];
  const supports = ev.filter((e) => e.relation === "SUPPORTS" && e.quoteValid);
  const srcIds = new Set(supports.map((e) => chunks.get(e.chunkId)!.sourceId));
  const authoritative = [...srcIds].some((id) => sources.get(id)?.authoritative);
  if (c.ownerPersonId) check(people.has(c.ownerPersonId), `claim ${c.id}: unknown owner`);

  switch (c.grade) {
    case "MISSING":
      check(ev.length === 0, `claim ${c.id}: MISSING but has evidence`);
      break;
    case "CONFLICTING":
      check(openConflictClaims.has(c.id), `claim ${c.id}: CONFLICTING but not in an OPEN conflict`);
      check(supports.length > 0, `claim ${c.id}: CONFLICTING without evidence`);
      break;
    case "INFERRED":
      check(c.isInference, `claim ${c.id}: INFERRED but isInference=false`);
      break;
    case "VERIFIED":
      check(
        srcIds.size >= 2 || authoritative,
        `claim ${c.id}: VERIFIED needs >=2 distinct sources or 1 authoritative (has ${srcIds.size})`,
      );
      break;
    case "SINGLE_SOURCE":
      check(srcIds.size === 1 && !authoritative, `claim ${c.id}: SINGLE_SOURCE needs exactly 1 non-authoritative source (has ${srcIds.size})`);
      break;
    default:
      errors.push(`claim ${c.id}: unknown grade ${c.grade}`);
  }
  if (c.grade !== "CONFLICTING") check(!openConflictClaims.has(c.id), `claim ${c.id}: in an OPEN conflict but graded ${c.grade}`);
  if (ev.length) {
    const max = Math.max(...ev.map((e) => RANK[chunks.get(e.chunkId)!.access]));
    check(RANK[c.access] === max, `claim ${c.id}: access ${c.access} is not the max of its evidence`);
  }
  if (c.fromTestimony) {
    check(ev.every((e) => sources.get(chunks.get(e.chunkId)!.sourceId)?.kind === "TESTIMONY"), `claim ${c.id}: testimony claim cites non-testimony evidence`);
  }
}

/* Conflicts, gaps, handover */
for (const cf of cache.conflicts) {
  check(claims.has(cf.claimAId) && claims.has(cf.claimBId), `conflict ${cf.id}: unknown claim`);
  if (cf.kind === "SUPERSEDES") check(cf.status === "RESOLVED", `conflict ${cf.id}: SUPERSEDES should not be OPEN`);
}
for (const g of cache.gapQuestions) {
  if (g.relatedClaimId) check(claims.has(g.relatedClaimId), `gap ${g.id}: unknown claim`);
  if (g.answer) check(g.testimonySourceId && sources.get(g.testimonySourceId)?.kind === "TESTIMONY", `gap ${g.id}: answered without testimony source`);
}
check(cache.gapQuestions.length === 10, `expected 10 gap questions, got ${cache.gapQuestions.length}`);
check(cache.handover.status === "IN_REVIEW", "handover should be IN_REVIEW");
for (const k of ["fromPersonId", "toPersonId", "reviewerPersonId"] as const) {
  check(people.has(cache.handover[k]), `handover ${k} unknown`);
}

/* Redaction + canary hygiene */
const canaries: string[] = truth.canaries.map((c: { value: string }) => c.value);
for (const c of cache.chunks) {
  check(!/ffk_(live|test)_/i.test(c.text), `chunk ${c.id}: raw ffk_ secret present`);
  check(!/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(c.text), `chunk ${c.id}: raw email present`);
  check(!/\+91[\s-]?\d{5}[\s-]?\d{5}/.test(c.text), `chunk ${c.id}: raw phone present`);
  for (const canary of canaries) {
    if (c.text.includes(canary)) check(c.access === "RESTRICTED", `chunk ${c.id}: canary ${canary} in a ${c.access} chunk`);
  }
}
for (const r of cache.redactions) {
  const ch = chunks.get(r.chunkId);
  check(ch && ch.text.includes(r.placeholder), `redaction ${r.id}: placeholder not in chunk`);
}
check(
  canaries.every((v) => cache.chunks.some((c) => c.text.includes(v))),
  "canary not present in any chunk (the leak test would be vacuous)",
);
for (const c of cache.claims) {
  const text = JSON.stringify(c);
  for (const v of canaries) check(!text.includes(v), `claim ${c.id}: contains canary`);
}

/* Coverage */
const types = ["DECISION", "TASK", "RISK", "DEPENDENCY", "CONTACT", "QUESTION", "RECURRING"];
const grades = ["VERIFIED", "SINGLE_SOURCE", "INFERRED", "CONFLICTING", "MISSING"];
for (const t of types) check(cache.claims.some((c) => c.type === t), `no claim of type ${t}`);
for (const g of grades) check(cache.claims.some((c) => c.grade === g), `no claim graded ${g}`);
const gapKinds = ["MISSING", "CONFLICT", "INFERRED", "RECURRING", "SINGLE_OWNER"];
for (const k of gapKinds) check(cache.gapQuestions.some((g) => g.kind === k), `no gap question of kind ${k}`);

/* Ground truth: every expected claim exists with the expected grade */
const expectations: { expectClaim: string; expectGrade?: string }[] = [
  ...truth.decisions,
  ...truth.risks,
  ...truth.gaps,
  ...truth.recurring,
];
for (const e of expectations) {
  const c = claims.get(e.expectClaim);
  check(c, `ground truth expects claim ${e.expectClaim}`);
  if (c && e.expectGrade) check(c.grade === e.expectGrade, `ground truth: ${e.expectClaim} expected ${e.expectGrade}, got ${c.grade}`);
}
for (const cf of truth.conflicts) {
  check(
    cache.conflicts.some((x) => x.kind === "CONTRADICTS" && x.claimAId === cf.a && x.claimBId === cf.b && x.status === "OPEN"),
    `ground truth conflict ${cf.topicKey} missing`,
  );
}
for (const s of truth.supersessions) {
  check(
    cache.conflicts.some((x) => x.kind === "SUPERSEDES" && x.claimAId === s.from && x.claimBId === s.to),
    `ground truth supersession ${s.topicKey} missing`,
  );
}

if (errors.length) {
  console.error(`verify-cache: FAILED (${errors.length})`);
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(
  `verify-cache: OK. ${quotesChecked}/${quotesChecked} quotes are exact substrings of their chunks; ` +
    `${cache.claims.length} claims, ${cache.chunks.length} chunks, ${cache.sources.length} sources, ` +
    `${cache.redactions.length} redactions, canary confined to RESTRICTED chunks.`,
);
