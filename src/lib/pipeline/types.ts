// Plain data shapes shared by every pipeline stage. DB-free and JSON-serialisable,
// identical in spirit to seed/pipeline-cache.json so the cache and live runs interchange.

import type {
  Access,
  ClaimStatus,
  ClaimType,
  ConflictKind,
  ConflictStatus,
  EvidenceRelation,
  GapKind,
  Grade,
  Resolution,
  SourceKind,
} from "@/generated/prisma/enums";

export type PSource = {
  id: string;
  kind: SourceKind;
  title: string;
  uri: string | null;
  access: Access;
  authoritative: boolean;
  author: string | null;
  createdAt: string;
  grantedToIncoming: boolean;
};

export type PChunk = {
  id: string;
  sourceId: string;
  ordinal: number;
  text: string;
  locator: string;
  author: string | null;
  timestamp: string | null;
  access: Access;
};

export type PPerson = {
  id: string;
  name: string;
  roleTitle: string;
  email: string | null;
  handles: string[];
};

export type PEvidence = {
  id: string;
  chunkId: string;
  quote: string;
  relation: EvidenceRelation;
  quoteValid: boolean;
  matchStart: number | null;
  matchEnd: number | null;
};

export type PClaim = {
  id: string;
  type: ClaimType;
  section: string;
  title: string;
  statement: string;
  topicKey: string;
  ownerPersonId: string | null;
  date: string | null;
  grade: Grade;
  gradeReason: string;
  status: ClaimStatus;
  access: Access;
  fromTestimony: boolean;
  /** Pipeline metadata (not a DB column): the model marked this as its own inference. */
  isInference: boolean;
  reviewerNote: string | null;
  /** Pipeline metadata: which handover checklist items this claim answers. */
  checklistKeys: string[];
  evidence: PEvidence[];
};

export type PConflict = {
  id: string;
  topicKey: string;
  claimAId: string;
  claimBId: string;
  kind: ConflictKind;
  status: ConflictStatus;
  resolution: Resolution | null;
  note: string | null;
};

export type PGapQuestion = {
  id: string;
  kind: GapKind;
  question: string;
  rationale: string;
  priority: number;
  relatedClaimId: string | null;
  checklistKey: string | null;
  answer: string | null;
  answeredAt: string | null;
  testimonySourceId: string | null;
};

export type PipelineInput = {
  projectId: string;
  projectName: string;
  sources: PSource[];
  chunks: PChunk[];
  people: PPerson[];
};

export type StageName =
  | "ingest"
  | "normalise"
  | "extract"
  | "validate"
  | "grade"
  | "conflicts"
  | "gaps"
  | "questions";

export const STAGES: StageName[] = [
  "ingest",
  "normalise",
  "extract",
  "validate",
  "grade",
  "conflicts",
  "gaps",
  "questions",
];

export type StageEvent = {
  stage: StageName | "done" | "error";
  status: "running" | "done" | "error" | "skipped";
  counts?: Record<string, number>;
  ms?: number;
  message?: string;
  /** Present on the final "done"/"error" event. */
  runId?: string;
  /** On the final "error" event: LLM_UNAVAILABLE = the model could not be reached; sources are kept. */
  code?: "LLM_UNAVAILABLE";
  mode?: "LIVE" | "CACHED";
  /** On the final "done" event: network LLM calls made in this run. */
  llmCalls?: number;
  model?: string;
  /** On the final "done" event: a LIVE run was requested but fell back to the cache. */
  fellBack?: boolean;
};

export type StageRecord = {
  stage: StageName;
  status: "done" | "error" | "skipped";
  counts: Record<string, number>;
  ms: number;
  /** Engine(s) that ran this stage: gemini | groq | rule-based | cache, joined with "+". */
  engine?: string;
};

export type PipelineStats = {
  rawClaims: number;
  rawQuotes: number;
  validQuotes: number;
  droppedQuotes: number;
  discardedClaims: number;
  mergedClaims: number;
};

export type PipelineResult = {
  claims: PClaim[];
  conflicts: PConflict[];
  gapQuestions: PGapQuestion[];
  stages: StageRecord[];
  stats: PipelineStats;
  /** Run-level engine label (live runs only). */
  engine?: string;
};

export type Emit = (e: StageEvent) => void;
