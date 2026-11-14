// Small builders for pipeline unit tests (not imported by app code).
import type { PChunk, PClaim, PEvidence, PSource } from "./types";

export function src(id: string, over: Partial<PSource> = {}): PSource {
  return {
    id,
    kind: "DOC",
    title: id,
    uri: null,
    access: "TEAM",
    authoritative: false,
    author: null,
    createdAt: "2026-03-01T00:00:00.000Z",
    grantedToIncoming: false,
    ...over,
  };
}

export function chunk(id: string, sourceId: string, text: string, over: Partial<PChunk> = {}): PChunk {
  return { id, sourceId, ordinal: 0, text, locator: "L1", author: null, timestamp: null, access: "TEAM", ...over };
}

export function ev(chunkId: string, quote = "a quote long enough", over: Partial<PEvidence> = {}): PEvidence {
  return { id: `ev_${chunkId}_${quote.length}`, chunkId, quote, relation: "SUPPORTS", quoteValid: true, matchStart: 0, matchEnd: quote.length, ...over };
}

export function claim(id: string, over: Partial<PClaim> = {}): PClaim {
  return {
    id,
    type: "DECISION",
    section: "Decisions",
    title: id,
    statement: `${id} statement`,
    topicKey: id,
    ownerPersonId: null,
    date: null,
    grade: "SINGLE_SOURCE",
    gradeReason: "",
    status: "DRAFT",
    access: "TEAM",
    fromTestimony: false,
    isInference: false,
    reviewerNote: null,
    checklistKeys: [],
    evidence: [],
    ...over,
  };
}
