// Persona-filtered claim access. Hidden claims never leave the server: callers get counts only.
import type { Prisma } from "@/generated/prisma/client";
import type { Access, ClaimType, Grade } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { allowedAccess, canSeeChunk, canSeeClaim, type Actor, type AllowedAccess } from "@/lib/authz";

export const claimInclude = {
  owner: { select: { id: true, name: true } },
  evidence: {
    orderBy: { id: "asc" },
    include: {
      chunk: {
        include: {
          source: {
            select: { id: true, kind: true, title: true, access: true, authoritative: true, uri: true, author: true },
          },
        },
      },
    },
  },
} satisfies Prisma.ClaimInclude;

export type ClaimFull = Prisma.ClaimGetPayload<{ include: typeof claimInclude }>;

export type VisibleClaims = {
  allowed: AllowedAccess;
  visible: ClaimFull[];
  hiddenCount: number;
  hiddenBySection: Record<string, number>;
};

export async function loadClaims(projectId: string, actor: Actor): Promise<VisibleClaims> {
  const [claims, allowed] = await Promise.all([
    prisma.claim.findMany({
      where: { projectId },
      include: claimInclude,
      orderBy: [{ date: "desc" }, { id: "asc" }],
    }),
    allowedAccess(actor.role, projectId),
  ]);
  const visible: ClaimFull[] = [];
  const hiddenBySection: Record<string, number> = {};
  for (const c of claims) {
    if (canSeeClaim(allowed, c)) visible.push(c);
    else hiddenBySection[c.section] = (hiddenBySection[c.section] ?? 0) + 1;
  }
  return {
    allowed,
    visible,
    hiddenCount: claims.length - visible.length,
    hiddenBySection,
  };
}

/* ------------------------------------------------------------------------- */
/* Ledger filtering (server-side, from searchParams)                          */
/* ------------------------------------------------------------------------- */

export type LedgerFilters = {
  type?: ClaimType;
  grade?: Grade;
  section?: string;
  owner?: string;
  access?: Access;
  q?: string;
};

const TYPES: ClaimType[] = ["DECISION", "TASK", "RISK", "DEPENDENCY", "CONTACT", "QUESTION", "RECURRING"];
const GRADES: Grade[] = ["VERIFIED", "SINGLE_SOURCE", "INFERRED", "CONFLICTING", "MISSING"];
const ACCESSES: Access[] = ["PUBLIC", "TEAM", "RESTRICTED"];

function one(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.length <= 200 ? s : undefined;
}

export function parseLedgerFilters(sp: Record<string, string | string[] | undefined>): LedgerFilters {
  const type = one(sp.type);
  const grade = one(sp.grade);
  const access = one(sp.access);
  return {
    type: TYPES.includes(type as ClaimType) ? (type as ClaimType) : undefined,
    grade: GRADES.includes(grade as Grade) ? (grade as Grade) : undefined,
    access: ACCESSES.includes(access as Access) ? (access as Access) : undefined,
    section: one(sp.section),
    owner: one(sp.owner),
    q: one(sp.q)?.trim() || undefined,
  };
}

function matches(c: ClaimFull, f: LedgerFilters, skip?: keyof LedgerFilters): boolean {
  if (skip !== "type" && f.type && c.type !== f.type) return false;
  if (skip !== "grade" && f.grade && c.grade !== f.grade) return false;
  if (skip !== "section" && f.section && c.section !== f.section) return false;
  if (skip !== "access" && f.access && c.access !== f.access) return false;
  if (skip !== "owner" && f.owner) {
    if (f.owner === "none" ? c.ownerPersonId !== null : c.ownerPersonId !== f.owner) return false;
  }
  if (skip !== "q" && f.q) {
    const q = f.q.toLowerCase();
    const hay = `${c.title} ${c.statement} ${c.topicKey} ${c.gradeReason}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

export function applyLedgerFilters(claims: ClaimFull[], f: LedgerFilters): ClaimFull[] {
  return claims.filter((c) => matches(c, f));
}

export type Facet = { value: string; label: string; count: number };

/** Facet counts for one dimension, computed with every *other* filter applied. */
export function facetCounts(
  claims: ClaimFull[],
  f: LedgerFilters,
  dim: "type" | "grade" | "section" | "owner" | "access",
): Map<string, number> {
  const out = new Map<string, number>();
  for (const c of claims) {
    if (!matches(c, f, dim)) continue;
    const key =
      dim === "owner" ? (c.ownerPersonId ?? "none") : dim === "section" ? c.section : (c[dim] as string);
    out.set(key, (out.get(key) ?? 0) + 1);
  }
  return out;
}

/** Distinct source ids that back a claim (SUPPORTS only). */
export function supportingSourceCount(c: ClaimFull): number {
  return new Set(c.evidence.filter((e) => e.relation === "SUPPORTS").map((e) => e.chunk.sourceId)).size;
}

/** Visible-chunk check reused by the source viewer. */
export { canSeeChunk };
