// Slack connector (server only). Three ways in, ONE importer (channelToRaw -> ingestIncremental):
//   "demo"      the pre-connected demo workspace (SLACK_BOT_TOKEN, never sent to the browser)
//   "conn:<id>" a workspace connected through OAuth v2 by this visitor (token encrypted at rest)
//   export ZIP  the official Slack export, parsed in memory
// Visibility maps automatically (public -> TEAM, private / DM -> RESTRICTED); the owner can override
// per channel. Re-sync fetches only messages newer than the stored ts per channel.
import { z } from "zod";
import type { Access } from "@/generated/prisma/enums";
import { assertCan, writeAudit, type Actor } from "@/lib/authz";
import { decryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { BadRequestError, NotFoundError } from "@/lib/http";
import { gradeClaim, lookupFrom } from "@/lib/pipeline/grade";
import { randomId } from "@/lib/pipeline/ids";
import { ingestIncremental, type IncrementalResult } from "@/lib/pipeline/incremental";
import type { RawSource } from "@/lib/pipeline/normalise";
import { loadPriorState, loadProjectData } from "@/lib/pipeline/store";
import { getVisitorId } from "@/lib/visitor";
import { demoId, isDemoSlug } from "@/lib/demo";
import type { PreparedExtraction } from "@/lib/pipeline/incremental";
import sample from "../../../../seed/slack-demo/messages.json";
import samplePrepared from "../../../../seed/slack-demo/prepared.json";
import { channelHistory, listChannels, listUsers, slackClient, SlackApiError, type SlackUser } from "./client";
import { parseSlackExport } from "./export";
import { channelToRaw, matchUsers, type ChannelDump } from "./map";

export type SlackRef = "demo" | `conn:${string}`;
export const SlackRefSchema = z.string().regex(/^(demo|conn:[A-Za-z0-9_-]{6,40})$/, "Unknown Slack workspace");

export function slackConfig() {
  return {
    oauth: !!(process.env.SLACK_CLIENT_ID?.trim() && process.env.SLACK_CLIENT_SECRET?.trim()),
    demo: !!process.env.SLACK_BOT_TOKEN?.trim(),
    signing: !!process.env.SLACK_SIGNING_SECRET?.trim(),
  };
}

type Team = { id: string; name: string; url: string | null };
const g = globalThis as unknown as { __batonSlackTeams?: Map<string, Team> };
const teams = (g.__batonSlackTeams ??= new Map());

async function teamFor(token: string, cacheKey: string): Promise<Team> {
  const hit = teams.get(cacheKey);
  if (hit) return hit;
  const j = await slackClient({ token }).call<{ ok: boolean; team_id: string; team: string; url?: string }>("auth.test");
  const t = { id: j.team_id, name: j.team, url: j.url ?? null };
  teams.set(cacheKey, t);
  return t;
}

/** Token + team for a workspace reference, after checking the visitor may use it. */
export async function tokenFor(ref: SlackRef): Promise<{ token: string; team: Team }> {
  if (ref === "demo") {
    const token = process.env.SLACK_BOT_TOKEN?.trim();
    if (!token) throw new BadRequestError("The demo Slack workspace is not configured on this server (SLACK_BOT_TOKEN). Upload a Slack export ZIP instead.");
    return { token, team: await teamFor(token, "demo") };
  }
  const vid = await getVisitorId();
  const c = await prisma.connection.findFirst({ where: { id: ref.slice(5), provider: "slack", revokedAt: null, ...(vid ? { visitorId: vid } : { id: "-" }) } });
  if (!c) throw new NotFoundError("Slack connection");
  return { token: decryptSecret(c.tokenEnc), team: { id: c.teamId, name: c.teamName, url: c.teamUrl } };
}

export type ChannelRow = { id: string; name: string; visibility: "public" | "private"; members: number; isMember: boolean; access: Access; topic: string };

export async function listSlackChannels(actor: Actor, ref: SlackRef): Promise<{ team: string; channels: ChannelRow[] }> {
  assertCan(actor, "connect_sources");
  const { token, team } = await tokenFor(ref);
  const chans = await listChannels(slackClient({ token }));
  return {
    team: team.name,
    channels: chans
      .map((c) => ({
        id: c.id,
        name: c.name,
        visibility: c.is_private ? ("private" as const) : ("public" as const),
        members: c.num_members ?? 0,
        isMember: !!c.is_member,
        access: (c.is_private ? "RESTRICTED" : "TEAM") as Access,
        topic: (c.purpose?.value || c.topic?.value || "").slice(0, 140),
      }))
      .sort((a, b) => Number(b.isMember) - Number(a.isMember) || a.name.localeCompare(b.name)),
  };
}

export const ImportInput = z.object({
  ref: SlackRefSchema,
  channels: z
    .array(z.object({ id: z.string().regex(/^[CGD][A-Z0-9]{4,20}$/, "Unknown channel"), access: z.enum(["PUBLIC", "TEAM", "RESTRICTED"]).optional() }))
    .min(1, "Pick at least one channel.")
    .max(20, "Pick at most 20 channels at a time."),
});

export type SlackImportResult = {
  team: string;
  imported: { name: string; messages: number; access: Access }[];
  skipped: { name: string; reason: string }[];
  result: IncrementalResult | null;
  peopleMatched: number;
};

/** Add matched Slack handles to people (identity map) so chat authors resolve to the project's people. */
async function mapPeople(projectId: string, users: SlackUser[]): Promise<number> {
  const people = await prisma.person.findMany({ where: { projectId }, select: { id: true, name: true, handles: true } });
  const add = matchUsers(users, people);
  for (const [id, handles] of add) {
    const p = people.find((x) => x.id === id)!;
    await prisma.person.update({ where: { id }, data: { handles: [...new Set([...p.handles, ...handles])] } });
  }
  return add.size;
}

type ProjectRef = { id: string; slug: string };

/**
 * The FestFlow sample Slack content (export ZIP or the seeded demo workspace) on the sample project
 * uses its prepared extraction, like the FestFlow pipeline cache; quotes are still re-validated.
 * Anything else goes through the engine chain (Groq -> Gemini -> rules).
 */
function preparedFor(project: ProjectRef, raws: RawSource[]) {
  if (!isDemoSlug(project.slug)) return undefined;
  const names = new Set(sample.channels.map((c) => c.name));
  const all = raws.every((r) => names.has(r.title.match(/^Slack #([^\s·]+)/)?.[1] ?? ""));
  return all ? { prepared: samplePrepared as unknown as PreparedExtraction, idFor: (id: string) => demoId(project.slug, id) } : undefined;
}

async function ingest(actor: Actor, project: ProjectRef, raws: RawSource[], meta: Record<string, unknown>) {
  const projectId = project.id;
  const result = raws.some((r) => r.items.length) ? await ingestIncremental(projectId, raws, { actor, reason: "slack", ...preparedFor(project, raws) }) : null;
  await writeAudit(prisma, { projectId, actor, action: "sources.slack_import", targetType: "Project", targetId: projectId, meta: { ...meta, newItems: result?.ingest.newItems ?? 0, newFacts: result?.newFacts.length ?? 0 } });
  return result;
}

export async function importSlack(actor: Actor, project: ProjectRef, raw: unknown): Promise<SlackImportResult> {
  const projectId = project.id;
  assertCan(actor, "connect_sources");
  const input = ImportInput.parse(raw);
  const { token, team } = await tokenFor(input.ref as SlackRef);
  const client = slackClient({ token });
  const [all, users] = await Promise.all([listChannels(client), listUsers(client).catch(() => [] as SlackUser[])]);
  const byId = new Map(all.map((c) => [c.id, c]));
  const userMap = new Map(users.map((u) => [u.id, u]));
  const peopleMatched = await mapPeople(projectId, users);
  const out: SlackImportResult = { team: team.name, imported: [], skipped: [], result: null, peopleMatched };
  const raws: RawSource[] = [];
  const cursors: { key: string; lastTs: string; name: string }[] = [];
  for (const pick of input.channels) {
    const ch = byId.get(pick.id);
    if (!ch) {
      out.skipped.push({ name: pick.id, reason: "Channel not found in this workspace." });
      continue;
    }
    const key = `${team.id}:${ch.id}`;
    const state = await prisma.syncState.findUnique({ where: { projectId_provider_externalKey: { projectId, provider: "slack", externalKey: key } } });
    const oldest = (state?.cursor as { lastTs?: string } | null)?.lastTs;
    try {
      const { items } = await channelHistory(client, ch.id, oldest);
      const dump: ChannelDump = { id: ch.id, name: ch.name, kind: ch.is_private ? "private" : "public", members: ch.num_members, messages: items };
      const src = channelToRaw(dump, { key: randomId("src"), team, users: userMap, access: pick.access ?? null });
      raws.push(src);
      out.imported.push({ name: ch.name, messages: src.items.length, access: src.access });
      const last = items.map((m) => m.ts).sort((a, b) => Number(b) - Number(a))[0] ?? oldest;
      if (last) cursors.push({ key, lastTs: last, name: ch.name });
    } catch (e) {
      if (e instanceof SlackApiError) out.skipped.push({ name: ch.name, reason: e.message });
      else throw e;
    }
  }
  if (!raws.length && out.skipped.length) throw new BadRequestError(out.skipped.map((s) => `#${s.name}: ${s.reason}`).join(" "));
  out.result = await ingest(actor, project, raws, { via: input.ref === "demo" ? "demo" : "oauth", team: team.name, channels: out.imported.map((c) => c.name) });
  for (const c of cursors) {
    await prisma.syncState.upsert({
      where: { projectId_provider_externalKey: { projectId, provider: "slack", externalKey: c.key } },
      create: { projectId, provider: "slack", externalKey: c.key, cursor: { lastTs: c.lastTs, ref: input.ref, name: c.name }, lastSyncedAt: new Date(), lastStatus: "ok" },
      update: { cursor: { lastTs: c.lastTs, ref: input.ref, name: c.name }, lastSyncedAt: new Date(), lastStatus: "ok", lastError: null },
    });
  }
  return out;
}

/** Re-sync every Slack channel imported into the project (only messages after the stored ts). */
export async function syncSlack(actor: Actor, project: ProjectRef) {
  const projectId = project.id;
  const states = await prisma.syncState.findMany({ where: { projectId, provider: "slack" } });
  const byRef = new Map<string, string[]>();
  for (const s of states) {
    const ref = (s.cursor as { ref?: string } | null)?.ref ?? "demo";
    byRef.set(ref, [...(byRef.get(ref) ?? []), s.externalKey.split(":")[1]]);
  }
  const results: SlackImportResult[] = [];
  for (const [ref, ids] of byRef) results.push(await importSlack(actor, project, { ref, channels: ids.map((id) => ({ id })) }));
  return results;
}

export async function importSlackExport(actor: Actor, project: ProjectRef, bytes: Uint8Array, fileName: string): Promise<SlackImportResult> {
  const projectId = project.id;
  assertCan(actor, "connect_sources");
  const ex = parseSlackExport(bytes);
  const users = new Map(ex.users.map((u) => [u.id, u]));
  const peopleMatched = await mapPeople(projectId, ex.users);
  const raws = ex.channels.map((c) => channelToRaw(c, { key: randomId("src"), team: { ...ex.team, url: null }, users }));
  if (!raws.some((r) => r.items.length)) throw new BadRequestError(`${fileName}: the export has no messages to import.`);
  const result = await ingest(actor, project, raws, { via: "export", file: fileName, channels: ex.channels.map((c) => c.name) });
  return { team: ex.team.name, imported: raws.map((r, i) => ({ name: ex.channels[i].name, messages: r.items.length, access: r.access })), skipped: [], result, peopleMatched };
}

/**
 * Cross-source verification: share of facts Confirmed with all sources vs. the same facts graded
 * without Slack evidence. null when the project has no Slack source.
 */
export async function slackImpact(projectId: string) {
  const { input } = await loadProjectData(projectId);
  const slackSources = new Set(
    (await prisma.source.findMany({ where: { projectId, externalId: { startsWith: "slack:" } }, select: { id: true } })).map((s) => s.id),
  );
  if (!slackSources.size) return null;
  const prior = await loadPriorState(projectId);
  const look = lookupFrom(input.chunks, input.sources);
  const chunkSource = new Map(input.chunks.map((c) => [c.id, c.sourceId]));
  const open = prior.conflicts.filter((c) => c.kind === "CONTRADICTS" && c.status === "OPEN");
  const inConflict = new Set(open.flatMap((c) => [c.claimAId, c.claimBId]));
  const live = prior.claims.filter((c) => c.status !== "REJECTED");
  let before = 0;
  let after = 0;
  let slackOnly = 0;
  for (const c of live) {
    const conflict = inConflict.has(c.id) ? { reason: "open conflict" } : null;
    if (gradeClaim(c, look, conflict).grade === "VERIFIED") after++;
    const without = { ...c, evidence: c.evidence.filter((e) => !slackSources.has(chunkSource.get(e.chunkId) ?? "")) };
    if (!without.evidence.length && c.evidence.length) slackOnly++;
    if (without.evidence.length && gradeClaim(without, look, conflict).grade === "VERIFIED") before++;
  }
  return { facts: live.length, before, after, slackOnly, slackSources: slackSources.size, beforePct: live.length ? before / live.length : 0, afterPct: live.length ? after / live.length : 0 };
}
