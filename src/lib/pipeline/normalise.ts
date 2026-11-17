// Normalise stage: raw source items -> redacted chunks with locators.
// Pure functions only (no fs, no db). Fixture/file adapters live in ./adapters.ts.

import type { Access, RedactionKind, SourceKind } from "@/generated/prisma/enums";

export const CHUNK_TARGET = 800;
const CHUNK_HARD_MAX = 1200;

/** One atomic unit of a source (a message, a commit, a paragraph, a comment). */
export type RawItem = {
  text: string;
  /** Locator for this item alone, e.g. "L14-L22", "#dev msg 41", "PR #84 comment 2". */
  locator: string;
  /** Sort key used when merging locators, e.g. a message number or line number. */
  pos?: { label: string; from: string; to: string };
  author?: string;
  timestamp?: Date;
  /** Stable id in the origin system (commit sha, comment id, message ts): a re-sync skips items already seen. */
  key?: string;
  /** Link back to the original item (e.g. a Slack permalink); kept on the chunk. */
  permalink?: string;
};

export type RawSource = {
  key: string;
  /** Stable id of the whole source in its origin system; a re-sync appends to the same source. */
  externalId?: string;
  kind: SourceKind;
  title: string;
  uri?: string;
  access: Access;
  authoritative: boolean;
  author?: string;
  createdAt: Date;
  grantedToIncoming?: boolean;
  /** Merge consecutive items into ~800-char chunks (chat, docs, commits, rows). */
  mergeItems: boolean;
  items: RawItem[];
};

export type PersonInput = {
  key: string;
  name: string;
  roleTitle?: string;
  email?: string;
  handles: string[];
};

export type NormalisedRedaction = {
  id: string;
  kind: RedactionKind;
  placeholder: string;
  mentionedBy: string | null;
};

export type NormalisedChunk = {
  id: string;
  sourceKey: string;
  ordinal: number;
  text: string;
  locator: string;
  author: string | null;
  timestamp: string | null;
  access: Access;
  redactions: NormalisedRedaction[];
  /** Where each linked item starts in `text` (Slack permalinks), so a quote maps to its message. */
  links?: { at: number; url: string }[];
};

/* ------------------------------------------------------------------------- */
/* Identity map                                                               */
/* ------------------------------------------------------------------------- */

export type IdentityMap = {
  resolve(handle: string | undefined | null): PersonInput | null;
  /** Handles seen in the data that resolved to a person. */
  hits: Map<string, string>;
};

export function buildIdentityMap(people: PersonInput[]): IdentityMap {
  const byHandle = new Map<string, PersonInput>();
  const norm = (h: string) => h.trim().replace(/^@/, "").toLowerCase();
  for (const p of people) {
    for (const h of [p.name, p.email ?? "", ...p.handles]) {
      if (h) byHandle.set(norm(h), p);
    }
  }
  const hits = new Map<string, string>();
  return {
    hits,
    resolve(handle) {
      if (!handle) return null;
      const p = byHandle.get(norm(handle)) ?? null;
      if (p) hits.set(handle, p.key);
      return p;
    },
  };
}

/* ------------------------------------------------------------------------- */
/* Redaction (runs BEFORE storage and BEFORE any LLM call)                    */
/* ------------------------------------------------------------------------- */

type Pattern = { kind: RedactionKind; re: RegExp; group?: number };

const PATTERNS: Pattern[] = [
  // Known secret prefixes (our fake demo prefix plus common live/test key shapes).
  { kind: "SECRET", re: /\b(?:ffk|sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{12,}\b/g },
  { kind: "SECRET", re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g },
  { kind: "SECRET", re: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: "SECRET", re: /\bxox[abpr]-[A-Za-z0-9-]{10,}\b/g },
  // Generic KEY=value / token: value assignments with a long opaque value.
  {
    kind: "SECRET",
    re: /\b[A-Z][A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|PASSWD|PWD)\s*[=:]\s*["']?([A-Za-z0-9+/_\-.]{16,})["']?/g,
    group: 1,
  },
  { kind: "EMAIL", re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  // Indian mobile numbers (+91 optional) and international +CC numbers.
  { kind: "PHONE", re: /(?:\+91[\s-]?)?\b[6-9]\d{4}[\s-]?\d{5}\b/g },
  { kind: "PHONE", re: /\+(?!91)\d{1,3}[\s-]?\(?\d{2,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}\b/g },
];

function shannon(s: string): number {
  const f = new Map<string, number>();
  for (const c of s) f.set(c, (f.get(c) ?? 0) + 1);
  let h = 0;
  for (const n of f.values()) {
    const p = n / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

export class Redactor {
  private counters: Record<RedactionKind, number> = { SECRET: 0, EMAIL: 0, PHONE: 0 };
  /** value -> placeholder, kept in memory only so repeats share a placeholder. */
  private seen = new Map<string, string>();
  private nextId = 1;
  /** `start` continues placeholder numbering after a project's existing redactions. */
  constructor(
    private readonly idPrefix = "red_",
    start: Partial<Record<RedactionKind, number>> = {},
  ) {
    for (const k of Object.keys(start) as RedactionKind[]) this.counters[k] = start[k] ?? 0;
  }

  redact(
    text: string,
    mentionedBy: string | null,
  ): { text: string; redactions: NormalisedRedaction[] } {
    const redactions: NormalisedRedaction[] = [];
    let out = text;
    for (const p of PATTERNS) {
      out = out.replace(p.re, (match, ...rest) => {
        const value: string =
          p.group !== undefined ? (rest[p.group - 1] as string) : match;
        if (!value || value.startsWith("[REDACTED")) return match;
        if (p.group !== undefined && shannon(value) < 3.0) return match;
        let placeholder = this.seen.get(value);
        if (!placeholder) {
          this.counters[p.kind] += 1;
          placeholder = `[REDACTED:${p.kind}-${this.counters[p.kind]}]`;
          this.seen.set(value, placeholder);
        }
        redactions.push({
          id: `${this.idPrefix}${this.nextId++}`,
          kind: p.kind,
          placeholder,
          mentionedBy,
        });
        return p.group !== undefined ? match.replace(value, placeholder) : placeholder;
      });
    }
    return { text: out, redactions };
  }
}

/* ------------------------------------------------------------------------- */
/* Chunking                                                                   */
/* ------------------------------------------------------------------------- */

function mergeLocator(items: RawItem[]): string {
  if (items.length === 1) return items[0].locator;
  const a = items[0].pos;
  const b = items[items.length - 1].pos;
  if (a && b && a.label === b.label) return `${a.label} ${a.from}–${b.to}`;
  return `${items[0].locator} – ${items[items.length - 1].locator}`;
}

function splitLong(item: RawItem): RawItem[] {
  if (item.text.length <= CHUNK_HARD_MAX) return [item];
  const paras = item.text.split(/\n{2,}/);
  const parts: string[] = [];
  let cur = "";
  for (const p of paras) {
    if (cur && cur.length + p.length + 2 > CHUNK_TARGET) {
      parts.push(cur);
      cur = p;
    } else cur = cur ? `${cur}\n\n${p}` : p;
  }
  if (cur) parts.push(cur);
  return parts.map((text, i) => ({
    ...item,
    text,
    locator: parts.length > 1 ? `${item.locator} (part ${i + 1})` : item.locator,
  }));
}

export function chunkSource(
  src: RawSource,
  redactor: Redactor,
  identity: IdentityMap,
  chunkId: (sourceKey: string, ordinal: number) => string,
): NormalisedChunk[] {
  // Redact per item so each redaction knows who mentioned it.
  const items = src.items.flatMap(splitLong).map((it) => {
    const person = identity.resolve(it.author);
    const author = person?.name ?? it.author ?? null;
    const r = redactor.redact(it.text, author);
    return { item: { ...it, text: r.text }, author, redactions: r.redactions };
  });

  const groups: (typeof items)[] = [];
  if (!src.mergeItems) {
    for (const it of items) groups.push([it]);
  } else {
    let cur: typeof items = [];
    let len = 0;
    for (const it of items) {
      const add = it.item.text.length + (cur.length ? 1 : 0);
      if (cur.length && len + add > CHUNK_TARGET) {
        groups.push(cur);
        cur = [];
        len = 0;
      }
      cur.push(it);
      len += it.item.text.length + (cur.length > 1 ? 1 : 0);
    }
    if (cur.length) groups.push(cur);
  }

  return groups.map((g, ordinal) => {
    const authors = [...new Set(g.map((x) => x.author).filter(Boolean))];
    const ts = g.find((x) => x.item.timestamp)?.item.timestamp;
    return {
      id: chunkId(src.key, ordinal),
      sourceKey: src.key,
      ordinal,
      text: g.map((x) => x.item.text).join("\n"),
      locator: mergeLocator(g.map((x) => x.item)),
      author: authors.length === 1 ? (authors[0] as string) : null,
      timestamp: ts ? ts.toISOString() : null,
      access: src.access,
      redactions: g.flatMap((x) => x.redactions),
      links: linksOf(g.map((x) => x.item)),
    };
  });
}

function linksOf(items: RawItem[]): { at: number; url: string }[] {
  const out: { at: number; url: string }[] = [];
  let at = 0;
  for (const it of items) {
    if (it.permalink) out.push({ at, url: it.permalink });
    at += it.text.length + 1;
  }
  return out;
}

/** The link of the item that contains offset `pos` of a chunk (last link starting at or before it). */
export function linkAt(links: { at: number; url: string }[] | undefined, pos: number | null | undefined): string | null {
  if (!links?.length) return null;
  const p = pos ?? 0;
  return [...links].reverse().find((l) => l.at <= p)?.url ?? links[0].url;
}

/** Stable key of a raw item: its own key, else a hash-like key from locator + text. */
export function itemKey(it: RawItem): string {
  if (it.key) return it.key;
  let h = 0;
  const s = `${it.locator}\u0000${it.text}`;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return `h${(h >>> 0).toString(36)}:${it.text.length}`;
}

export function normaliseSources(
  sources: RawSource[],
  people: PersonInput[],
  opts: { chunkId?: (sourceKey: string, ordinal: number) => string; redactor?: Redactor } = {},
) {
  const identity = buildIdentityMap(people);
  const redactor = opts.redactor ?? new Redactor();
  const chunkId =
    opts.chunkId ??
    ((k: string, i: number) => `${k.replace(/^src_/, "chk_")}_${i}`);
  const chunks = sources.flatMap((s) => chunkSource(s, redactor, identity, chunkId));
  return { chunks, identityHits: identity.hits };
}
