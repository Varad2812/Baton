// Shapes shared by the "Ask the handover" modules (pure, client-safe).
import type { Grade } from "@/generated/prisma/enums";

/** One retrievable item: a fact from the handover, or an excerpt of a source it cites. */
export type AskDoc = {
  id: string;
  kind: "claim" | "chunk";
  title: string;
  /** Text the answer may quote from (fact: title, statement and its quotes; excerpt: the chunk text). */
  text: string;
  /** Citation label, e.g. "PR #84" or "notes 14-Mar". */
  label: string;
  /** The fact the citation opens in the evidence drawer. */
  claimId: string;
  grade?: Grade;
  section?: string;
  topicKey?: string;
  /** Facts: the excerpts they cite. */
  chunkIds?: string[];
  /** Facts: supporting quotes (exact substrings of their sources). */
  quotes?: string[];
  evidence?: { chunkId: string; label: string; quote: string }[];
  date?: string | null;
  replacedBy?: string;
  fromTestimony?: boolean;
  /** Excerpt recorded after the approved version (testimony from a follow-up). */
  afterApproval?: boolean;
};

export type AskCorpus = {
  mode: "approved" | "draft";
  version: number | null;
  approvedBy: string | null;
  claims: AskDoc[];
  chunks: AskDoc[];
  /** Strings that must never appear in an answer for this viewer (canaries, hidden quotes). */
  forbidden: string[];
  /** Facts at this access level that are not part of the corpus (count only). */
  hiddenCount: number;
  owner: { first: string; full: string };
  /** May the viewer send a follow-up to the owner (successor only)? */
  canAskOwner: boolean;
};

export type AskSource = {
  n: number;
  kind: "claim" | "chunk";
  id: string;
  claimId: string;
  title: string;
  label: string;
  grade?: Grade;
  excerpt: string;
  afterApproval?: boolean;
};

export type AskSentence = { text: string; cites: number[] };

export type AskStats = { proposed: number; kept: number; dropped: number; citations: number; validCitations: number };

export type AskAnswer = {
  status: "answered" | "refused";
  /** not_found: nothing relevant; gap: the handover lists it as unknown; leak: blocked by the canary scan. */
  reason?: "not_found" | "gap" | "leak";
  text: string;
  sentences: AskSentence[];
  sources: AskSource[];
  mode: AskCorpus["mode"];
  version: number | null;
  approvedBy: string | null;
  engine: "groq" | "gemini" | "offline";
  model: string | null;
  askOwner: { first: string; allowed: boolean };
  /** The known gap that matched (reason "gap"). */
  gap?: { title: string; claimId: string };
  stats: AskStats;
};

export const NOT_IN_HANDOVER = "This isn't in the approved handover.";
export const NOT_IN_DRAFT = "This isn't in the draft handover.";
