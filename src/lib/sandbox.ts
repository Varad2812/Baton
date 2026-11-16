// Per-visitor sandboxes. resolveProject(slug) is the single choke point every page, route handler
// and server action uses to turn a slug into a project:
//   - "festflow" (the template) means the visitor's own copy, created on first use;
//   - a project owned by another visitor is "not found";
//   - sandboxes and visitor projects stay alive while used (TTL refreshed at most hourly).
import type { Project } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { DEMO_SLUG, demoSuffix, SANDBOX_RE } from "@/lib/demo";
import { insertFestflow } from "@/lib/seed/festflow";
import { getVisitorId, sandboxSlug } from "@/lib/visitor";

export const SANDBOX_TTL_MS = 24 * 60 * 60_000;
export const PROJECT_TTL_MS = 7 * 24 * 60 * 60_000;
const TOUCH_EVERY_MS = 60 * 60_000;
const TX = { timeout: 60_000, maxWait: 15_000 } as const;

const g = globalThis as unknown as { __batonSandboxes?: Map<string, Promise<Project>> };
const inflight = (g.__batonSandboxes ??= new Map());

/** Memberships granted through invite links (filled in by the invite module; none by default). */
export type MembershipCheck = (projectId: string) => Promise<boolean>;
let membership: MembershipCheck = async () => false;
export function setMembershipCheck(fn: MembershipCheck) {
  membership = fn;
}

export const ttlFor = (kind: Project["kind"]) => (kind === "SANDBOX" ? SANDBOX_TTL_MS : PROJECT_TTL_MS);

/** Create the visitor's sandbox if it does not exist yet (concurrent first requests share one clone). */
export async function ensureSandbox(vid: string): Promise<Project> {
  const slug = sandboxSlug(vid);
  const existing = await prisma.project.findUnique({ where: { slug } });
  if (existing) return existing;
  let p = inflight.get(slug);
  if (!p) {
    p = (async () => {
      try {
        await prisma.$transaction(
          (tx) => insertFestflow(tx, { slug, suffix: demoSuffix(slug), kind: "SANDBOX", visitorId: vid, expiresAt: new Date(Date.now() + SANDBOX_TTL_MS) }),
          TX,
        );
      } catch (e) {
        // Another instance won the race: use its copy.
        if ((e as { code?: string })?.code !== "P2002") throw e;
      }
      return prisma.project.findUniqueOrThrow({ where: { slug } });
    })().finally(() => inflight.delete(slug));
    inflight.set(slug, p);
  }
  return p;
}

/** Throw away the visitor's sandbox and clone a fresh one (same slug and ids), in one transaction. */
export async function resetSandbox(vid: string): Promise<Project> {
  const slug = sandboxSlug(vid);
  await prisma.$transaction(async (tx) => {
    await tx.project.deleteMany({ where: { slug, visitorId: vid } });
    await insertFestflow(tx, { slug, suffix: demoSuffix(slug), kind: "SANDBOX", visitorId: vid, expiresAt: new Date(Date.now() + SANDBOX_TTL_MS) });
  }, TX);
  return prisma.project.findUniqueOrThrow({ where: { slug } });
}

function touch(p: Project) {
  if (!p.expiresAt) return;
  const ttl = ttlFor(p.kind);
  if (p.expiresAt.getTime() - Date.now() > ttl - TOUCH_EVERY_MS) return;
  prisma.project
    .update({ where: { id: p.id }, data: { expiresAt: new Date(Date.now() + ttl) } })
    .catch(() => undefined);
}

/** May this visitor open this project? Templates and legacy projects (no owner) are open to all. */
export async function canOpen(p: Pick<Project, "id" | "visitorId">, vid: string | null): Promise<boolean> {
  if (!p.visitorId) return true;
  if (vid && p.visitorId === vid) return true;
  return membership(p.id);
}

/**
 * Slug -> project for the current visitor, or null (missing, or someone else's).
 * The template slug resolves to the visitor's sandbox; outside a request (scripts) it is the template.
 */
export async function resolveProject(slug: string): Promise<Project | null> {
  const vid = await getVisitorId();
  let s = slug;
  if (s === DEMO_SLUG && vid) s = sandboxSlug(vid);
  let p = await prisma.project.findUnique({ where: { slug: s } });
  if (!p && vid && SANDBOX_RE.test(s) && s === sandboxSlug(vid)) p = await ensureSandbox(vid);
  if (!p) return null;
  if (!(await canOpen(p, vid))) return null;
  touch(p);
  return p;
}

/** Delete expired sandboxes and visitor projects (templates and legacy projects never expire). */
export async function cleanupExpired(now = new Date()) {
  const r = await prisma.project.deleteMany({ where: { kind: { not: "TEMPLATE" }, expiresAt: { lt: now } } });
  return { deleted: r.count, at: now.toISOString() };
}
