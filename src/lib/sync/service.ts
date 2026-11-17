// Continuous handover: keep a project's knowledge current after approval.
//   syncNow          GitHub (and Slack, see connectors) re-sync since the stored cursor
//   simulateActivity the sample project's prepared batch (seed/later-activity), SAME incremental path
//   pendingChanges   what changed since the latest approved version, at the viewer's access level
import type { Project } from "@/generated/prisma/client";
import { allowedAccess, assertCan, writeAudit, type Actor } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { demoId, isDemoSlug } from "@/lib/demo";
import { classifyChanges, visibleTo, type ChangeSet } from "@/lib/handover/changes";
import type { Snapshot } from "@/lib/handover/compile";
import { buildSnapshot } from "@/lib/handover/service";
import { BadRequestError } from "@/lib/http";
import { commitsSource, chatSources, type ChatExport, type GhCommit } from "@/lib/pipeline/adapters";
import { randomId } from "@/lib/pipeline/ids";
import { ingestIncremental, type IncrementalResult, type PreparedExtraction } from "@/lib/pipeline/incremental";
import { fetchGithubDelta, type GithubCursor } from "@/lib/pipeline/ingest/github";
import type { RawSource } from "@/lib/pipeline/normalise";
import activity from "../../../seed/later-activity/activity.json";
import prepared from "../../../seed/later-activity/prepared.json";

/* ------------------------------------------------------------------------- */
/* Simulated activity (sample project only)                                  */
/* ------------------------------------------------------------------------- */

export function simulatedSources(): RawSource[] {
  const a = activity as unknown as { repo: string; commits: GhCommit[]; chat: ChatExport };
  const commits: RawSource = {
    ...commitsSource(randomId("src"), a.repo, a.commits, "TEAM"),
    title: `${a.repo} · commits 24 Apr (simulated new activity)`,
    externalId: "sim:commits",
  };
  const chats = chatSources(a.chat, () => ({ key: randomId("src"), access: "TEAM" })).map((s, i) => ({
    ...s,
    title: `${s.title.replace(/ · .*$/, "")} · 24–26 Apr (simulated new activity)`,
    externalId: `sim:chat:${a.chat.channels[i].channel.name}`,
  }));
  return [commits, ...chats];
}

/** Inject the prepared batch through the normal incremental path. A second click adds nothing. */
export async function simulateActivity(actor: Actor, project: Pick<Project, "id" | "slug">): Promise<IncrementalResult> {
  assertCan(actor, "connect_sources");
  if (!isDemoSlug(project.slug)) throw new BadRequestError("Simulated activity exists only for the sample project. Use Sync now on your own project.");
  return ingestIncremental(project.id, simulatedSources(), {
    actor,
    reason: "simulate",
    prepared: prepared as unknown as PreparedExtraction,
    idFor: (id) => demoId(project.slug, id),
  });
}

/* ------------------------------------------------------------------------- */
/* Sync now (GitHub)                                                         */
/* ------------------------------------------------------------------------- */

export type SyncSummary = {
  repos: { repo: string; status: "updated" | "no_changes" | "error"; counts?: { commits: number; pulls: number; issues: number }; error?: string }[];
  result: IncrementalResult | null;
};

/** Fetch what changed in every connected GitHub repo since its cursor and run the incremental pipeline. */
export async function syncGithub(projectId: string, opts: { actor: Actor; system?: boolean; reason?: "sync" | "webhook" }): Promise<SyncSummary> {
  if (!opts.system) assertCan(opts.actor, "connect_sources");
  const states = await prisma.syncState.findMany({ where: { projectId, provider: "github" } });
  if (!states.length) throw new BadRequestError("No GitHub repository is connected to this project yet. Import a public repo first.");
  const raw: RawSource[] = [];
  const out: SyncSummary = { repos: [], result: null };
  const cursors = new Map<string, GithubCursor>();
  for (const st of states) {
    try {
      const d = await fetchGithubDelta(st.externalKey, st.cursor as unknown as GithubCursor, {
        token: process.env.GITHUB_TOKEN?.trim() || undefined,
        access: "PUBLIC",
        key: () => randomId("src"),
      });
      raw.push(...d.sources);
      cursors.set(st.id, d.cursor);
      out.repos.push({ repo: st.externalKey, status: d.sources.length ? "updated" : "no_changes", counts: d.counts });
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e);
      await prisma.syncState.update({ where: { id: st.id }, data: { lastStatus: "error", lastError: msg.slice(0, 500), lastSyncedAt: new Date() } });
      out.repos.push({ repo: st.externalKey, status: "error", error: msg });
    }
  }
  if (raw.length) out.result = await ingestIncremental(projectId, raw, { actor: opts.actor, reason: opts.reason ?? "sync", system: opts.system });
  for (const [id, cursor] of cursors) {
    await prisma.syncState.update({ where: { id }, data: { cursor, lastStatus: "ok", lastError: null, lastSyncedAt: new Date() } });
  }
  if (out.repos.every((r) => r.status === "error")) throw new BadRequestError(out.repos[0]?.error ?? "Sync failed.");
  return out;
}

/* ------------------------------------------------------------------------- */
/* Change detection                                                          */
/* ------------------------------------------------------------------------- */

async function versionSnapshot(projectId: string, number: number): Promise<Snapshot | null> {
  const v = await prisma.handoverVersion.findFirst({ where: { number, handover: { projectId } }, select: { snapshot: true } });
  return (v?.snapshot as unknown as Snapshot) ?? null;
}

/** Changes since the latest approved version (null before the first approval). */
export async function pendingChanges(actor: Actor, projectId: string): Promise<ChangeSet | null> {
  const h = await prisma.handover.findFirst({ where: { projectId }, orderBy: { id: "asc" }, select: { currentVersion: true } });
  if (!h?.currentVersion) return null;
  const [approved, current, allowed] = await Promise.all([versionSnapshot(projectId, h.currentVersion), buildSnapshot(projectId), allowedAccess(actor.role, projectId)]);
  if (!approved) return null;
  return classifyChanges(visibleTo(allowed, approved), visibleTo(allowed, current), h.currentVersion);
}

/** What changed between two approved versions (for "What changed since v1"). */
export async function changesBetween(actor: Actor, projectId: string, from: number, to: number): Promise<ChangeSet | null> {
  const [a, b, allowed] = await Promise.all([versionSnapshot(projectId, from), versionSnapshot(projectId, to), allowedAccess(actor.role, projectId)]);
  if (!a || !b) return null;
  return classifyChanges(visibleTo(allowed, a), visibleTo(allowed, b), from);
}

/* ------------------------------------------------------------------------- */
/* "New version" badge for the successor                                     */
/* ------------------------------------------------------------------------- */

/** The successor opened version `n` of the handover (once per version). */
export async function markHandoverViewed(actor: Actor, projectId: string, version: number) {
  if (actor.role !== "INCOMING" || !version) return;
  const seen = await prisma.auditLog.findFirst({ where: { projectId, action: "handover.viewed", actorName: actor.name, targetId: String(version) }, select: { id: true } });
  if (seen) return;
  await writeAudit(prisma, { projectId, actor, action: "handover.viewed", targetType: "HandoverVersion", targetId: String(version), meta: { version } });
}

/** Latest approved version the successor has not opened yet (0 = none). */
export async function unseenVersion(actor: Actor, projectId: string, current: number): Promise<number> {
  if (actor.role !== "INCOMING" || current < 2) return 0;
  const seen = await prisma.auditLog.findFirst({ where: { projectId, action: "handover.viewed", actorName: actor.name, targetId: String(current) }, select: { id: true } });
  return seen ? 0 : current;
}
