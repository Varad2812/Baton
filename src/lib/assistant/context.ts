// What the assistant may know for one question. The pure builder filters EVERY claim itself with
// canSeeClaim (the same rule as the ledger and role compilation), keeps conflicts only when both
// sides are visible, gap questions only for roles that see Team data, and computes the strings that
// must never appear in an answer (canaries in hidden chunks, quotes of hidden claims) with the same
// forbiddenStrings() used by handover compilation.
import type { Access, ClaimType, Grade, Role } from "@/generated/prisma/enums";
import { canSeeClaim, type AllowedAccess } from "@/lib/authz";
import { forbiddenStrings, type ChunkForScan, type SnapshotClaim } from "@/lib/handover/compile";
import { GRADE_SHORT, ROLE_LABEL, TYPE_LABEL } from "@/lib/views/format";
import { PAGE_NAME, type PageKey } from "./actions";
import { overlapScore } from "./match";

export type CtxEvidence = {
  quote: string;
  relation: "SUPPORTS" | "CONTRADICTS";
  cite: string;
  chunk: { access: Access; sourceId: string };
};

export type CtxClaim = {
  id: string;
  type: ClaimType;
  section: string;
  title: string;
  statement: string;
  topicKey: string;
  grade: Grade;
  gradeReason: string;
  status: string;
  access: Access;
  fromTestimony: boolean;
  date: string | null;
  owner: string | null;
  evidence: CtxEvidence[];
};

export type CtxConflict = { id: string; topicKey: string; kind: string; status: string; claimAId: string; claimBId: string };
export type CtxQuestion = { id: string; kind: string; question: string; rationale: string; priority: number; answered: boolean; relatedClaimId: string | null };
export type CtxPlan = { plan7: string[]; plan30: string[]; approved: boolean };

export type ContextInput = {
  page: PageKey;
  question: string;
  viewer: { name: string; role: Role };
  allowed: AllowedAccess;
  project: { name: string; description: string } | null;
  /** Every claim of the project (the builder decides what is visible). */
  claims: CtxClaim[];
  conflicts: CtxConflict[];
  questions: CtxQuestion[];
  /** Every chunk of the project, for the canary / hidden-quote scan. */
  chunks: ChunkForScan[];
  handover: { status: string; versions: number; from: string; to: string; reviewer: string } | null;
  sources: number;
  redactions: number;
  /** Role-compiled plan for this viewer (already leak-checked by compileView), if relevant. */
  plan?: CtxPlan | null;
};

export type CitableFact = { id: string; title: string; grade: Grade };

export type AssistantContext = {
  /** Prompt block for the model. Built only from visible data. */
  text: string;
  /** Facts the answer may cite (ids the client turns into chips). */
  facts: CitableFact[];
  /** Relevant visible facts, best first (offline engine uses these). */
  relevant: CtxClaim[];
  summary: {
    visible: number;
    hidden: number;
    byGrade: Record<Grade, number>;
    openConflicts: { id: string; a: CtxClaim; b: CtxClaim }[];
    openQuestions: CtxQuestion[];
    answeredQuestions: number;
    handover: ContextInput["handover"];
    sources: number;
    redactions: number;
    plan: CtxPlan | null;
  };
  /** Strings that must never appear in an answer for this viewer. */
  forbidden: string[];
};

const SEES: Record<Role, string> = {
  OWNER: "sees every fact (Public, Team, Restricted)",
  REVIEWER: "sees every fact (Public, Team, Restricted)",
  INCOMING: "sees Public and Team facts, plus Restricted sources the owner granted",
  OBSERVER: "sees Public facts only",
};

const PAGE_BOOST: Partial<Record<PageKey, (c: CtxClaim) => number>> = {
  conflicts: (c) => (c.grade === "CONFLICTING" ? 0.3 : 0),
  interview: (c) => (c.grade === "MISSING" || c.fromTestimony ? 0.3 : 0),
  review: (c) => (c.grade === "INFERRED" || c.grade === "CONFLICTING" ? 0.15 : 0),
};

const MAX_FACTS = 12;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function asSnapshot(c: CtxClaim): SnapshotClaim {
  return {
    id: c.id,
    type: c.type,
    section: c.section,
    title: c.title,
    statement: c.statement,
    topicKey: c.topicKey,
    grade: c.grade,
    gradeReason: c.gradeReason,
    status: c.status,
    access: c.access,
    fromTestimony: c.fromTestimony,
    owner: c.owner,
    date: c.date,
    reviewerNote: null,
    evidence: c.evidence.map((e) => ({
      chunkId: "",
      sourceId: e.chunk.sourceId,
      sourceTitle: "",
      sourceKind: "",
      access: e.chunk.access,
      locator: e.cite,
      quote: e.quote,
      relation: e.relation,
    })),
  };
}

export function isVisible(allowed: AllowedAccess, c: CtxClaim): boolean {
  return canSeeClaim(allowed, { access: c.access, evidence: c.evidence.map((e) => ({ chunk: e.chunk })) });
}

export function buildAssistantContext(input: ContextInput): AssistantContext {
  const { allowed } = input;
  const seeable = input.claims.filter((c) => isVisible(allowed, c));
  const seeableIds = new Set(seeable.map((c) => c.id));
  const hidden = input.claims.filter((c) => !seeableIds.has(c.id));
  const live = seeable.filter((c) => c.status !== "REJECTED");
  const byId = new Map(live.map((c) => [c.id, c]));

  const byGrade = { VERIFIED: 0, SINGLE_SOURCE: 0, INFERRED: 0, CONFLICTING: 0, MISSING: 0 } as Record<Grade, number>;
  for (const c of live) byGrade[c.grade]++;

  const openConflicts = input.conflicts
    .filter((c) => c.kind === "CONTRADICTS" && c.status === "OPEN" && byId.has(c.claimAId) && byId.has(c.claimBId))
    .map((c) => ({ id: c.id, a: byId.get(c.claimAId)!, b: byId.get(c.claimBId)! }));

  // Gap questions carry Team-level detail; Observers never get them, and a question about a hidden
  // claim is dropped for everyone who cannot see that claim.
  const teamOk = allowed.levels.includes("TEAM");
  const questions = teamOk ? input.questions.filter((q) => !q.relatedClaimId || seeableIds.has(q.relatedClaimId)) : [];
  const openQuestions = questions.filter((q) => !q.answered).sort((a, b) => b.priority - a.priority);

  // Relevance: words shared with the question, plus a small boost for what the current page is about.
  const boost = PAGE_BOOST[input.page];
  const conflictIds = new Set(openConflicts.flatMap((c) => [c.a.id, c.b.id]));
  const scored = live
    .map((c) => ({
      c,
      s: overlapScore(input.question, `${c.title} ${c.statement} ${c.section} ${c.topicKey.replace(/_/g, " ")} ${TYPE_LABEL[c.type]}`) + (boost?.(c) ?? 0),
    }))
    .sort((x, y) => y.s - x.s);
  const relevant = scored.filter((x) => x.s >= 0.34).map((x) => x.c);
  const picked = new Map<string, CtxClaim>();
  for (const c of relevant.slice(0, MAX_FACTS)) picked.set(c.id, c);
  if (input.page === "conflicts" || /conflict|disagree/i.test(input.question))
    for (const id of conflictIds) if (picked.size < MAX_FACTS + 4) picked.set(id, byId.get(id)!);
  const facts = [...picked.values()];

  const forbidden = forbiddenStrings(allowed, input.chunks, hidden.map(asSnapshot), [], seeable.map(asSnapshot));

  const plan = input.plan ?? null;
  const h = input.handover;
  const lines: string[] = [];
  lines.push(`CURRENT PAGE: ${PAGE_NAME[input.page]}`);
  lines.push(`VIEWER: ${input.viewer.name}, role ${ROLE_LABEL[input.viewer.role]} (${SEES[input.viewer.role]}).`);
  if (input.project) {
    lines.push(`PROJECT: ${input.project.name}. ${input.project.description}`);
    lines.push(
      `COUNTS visible to this viewer: ${live.length} facts (Confirmed ${byGrade.VERIFIED}, Single source ${byGrade.SINGLE_SOURCE}, AI inference ${byGrade.INFERRED}, Conflicting ${byGrade.CONFLICTING}, Missing ${byGrade.MISSING}); ${hidden.length} facts hidden at this access level (count only, contents unknown to you); ${openConflicts.length} open conflicts; ${teamOk ? `${openQuestions.length} open questions for the owner, ${questions.length - openQuestions.length} answered` : "questions for the owner not visible to this role"}; ${input.sources} sources; ${input.redactions} redactions.`,
    );
    if (h) lines.push(`HANDOVER: ${h.from} -> ${h.to}, reviewer ${h.reviewer}; status ${h.status.toLowerCase().replace("_", " ")}; ${h.versions} approved version${h.versions === 1 ? "" : "s"}.`);
  }
  if (facts.length) {
    lines.push("", "FACTS relevant to the question (cite by id):");
    for (const c of facts) {
      const ev = c.evidence
        .filter((e) => e.quote)
        .slice(0, 2)
        .map((e) => `${e.relation === "CONTRADICTS" ? "contradicted by" : "quote"} "${clip(e.quote, 160)}" (${e.cite})`)
        .join("; ");
      lines.push(`[${c.id}] ${GRADE_SHORT[c.grade]} · ${TYPE_LABEL[c.type]} · ${c.section}${c.date ? ` · ${c.date}` : ""}${c.fromTestimony ? " · testimony" : ""}: ${c.title}. ${clip(c.statement, 280)}${ev ? ` Evidence: ${ev}.` : ""} Why this grade: ${c.gradeReason || "n/a"}`);
    }
  }
  if (openConflicts.length) {
    lines.push("", "OPEN CONFLICTS:");
    for (const c of openConflicts) lines.push(`- A [${c.a.id}] "${c.a.title}" vs B [${c.b.id}] "${c.b.title}"`);
  }
  if (openQuestions.length) {
    lines.push("", "OPEN QUESTIONS FOR THE OWNER (highest priority first):");
    for (const q of openQuestions.slice(0, 6)) lines.push(`- (P${q.priority}) ${q.question}`);
  }
  if (plan && (plan.plan7.length || plan.plan30.length)) {
    lines.push("", `SUCCESSOR PLAN for this viewer's role (${plan.approved ? "approved version" : "draft preview, not yet approved"}):`);
    for (const p of plan.plan7.slice(0, 8)) lines.push(`- 7-day: ${clip(p, 200)}`);
    for (const p of plan.plan30.slice(0, 6)) lines.push(`- 30-day: ${clip(p, 200)}`);
  }

  return {
    text: lines.join("\n"),
    facts: facts.map((c) => ({ id: c.id, title: c.title, grade: c.grade })),
    relevant: relevant.length ? relevant : [],
    summary: {
      visible: live.length,
      hidden: hidden.length,
      byGrade,
      openConflicts,
      openQuestions,
      answeredQuestions: questions.length - openQuestions.length,
      handover: h,
      sources: input.sources,
      redactions: input.redactions,
      plan,
    },
    forbidden,
  };
}
