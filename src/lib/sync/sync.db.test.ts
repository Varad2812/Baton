// Integration tests on the LOCAL database only (skipped elsewhere): incremental sync is idempotent,
// never rewrites reviewed facts, and the simulated batch produces exactly seed/later-activity/expected.json.
import { afterAll, describe, expect, it } from "vitest";
import { PERSONAS } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { templateWriter } from "@/lib/handover/compile";
import { approveVersion, editClaim } from "@/lib/handover/service";
import { ingestIncremental } from "@/lib/pipeline/incremental";
import { fetchGithubDelta, type FetchLike } from "@/lib/pipeline/ingest/github";
import { randomId } from "@/lib/pipeline/ids";
import { cleanupExpired, resetSandbox } from "@/lib/sandbox";
import expected from "../../../seed/later-activity/expected.json";
import { pendingChanges, simulateActivity } from "./service";

const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "");
const meera = { ...PERSONAS.meera };
const rao = { ...PERSONAS.rao };
const counts = async (projectId: string) => ({
  sources: await prisma.source.count({ where: { projectId } }),
  chunks: await prisma.chunk.count({ where: { source: { projectId } } }),
  claims: await prisma.claim.count({ where: { projectId } }),
  evidence: await prisma.evidence.count({ where: { claim: { projectId } } }),
  conflicts: await prisma.conflict.count({ where: { projectId } }),
});

describe.skipIf(!local)("incremental sync (local DB)", () => {
  afterAll(async () => {
    await prisma.project.deleteMany({ where: { visitorId: { startsWith: "vitest-" } } });
    await prisma.$disconnect();
  });

  it("simulated activity matches expected.json, keeps reviewer edits, and a second run adds nothing", async () => {
    const p = await resetSandbox("vitest-sim-0001");
    const early = `clm_early_bird${p.idSuffix}`;
    await editClaim(rao, p.id, early, { title: "Early-bird pass ₹299 (reviewed)" });
    await approveVersion(rao, p.id, { override: true, note: "test override note" }, { writer: templateWriter });

    const r = await simulateActivity(meera, p);
    expect(r.ingest.newSources).toHaveLength(expected.newSources);
    expect(r.newFacts).toHaveLength(expected.newFacts);
    expect(r.conflicts.contradicts).toBe(expected.contradictions);
    expect(r.confirmed).toHaveLength(expected.confirmed);

    const ch = await pendingChanges(rao, p.id);
    expect(ch).toMatchObject({ version: 1 });
    expect(ch!.newFacts).toHaveLength(expected.newFacts);
    expect(ch!.contradicted).toHaveLength(expected.contradictions);
    expect(ch!.outdated).toHaveLength(expected.outdated);
    expect(ch!.confirmed).toHaveLength(expected.confirmed);

    const edited = await prisma.claim.findUniqueOrThrow({ where: { id: early } });
    expect(edited.title).toBe("Early-bird pass ₹299 (reviewed)");
    expect(edited.status).toBe("APPROVED");

    const before = await counts(p.id);
    const again = await simulateActivity(meera, p);
    expect(again.runId).toBeNull();
    expect(again.ingest.skippedItems).toBeGreaterThan(0);
    expect(await counts(p.id)).toEqual(before);
  }, 60_000);

  it("GitHub delta: re-sync appends only new commits; ETag 304 fetches nothing", async () => {
    const p = await prisma.project.create({ data: { slug: `vitest-gh-${Date.now().toString(36)}`, name: "Sync test", visitorId: "vitest-gh", expiresAt: new Date(Date.now() + 60_000) } });
    const commit = (sha: string, date: string, msg: string) => ({ sha, commit: { author: { name: "Ada", date }, message: msg }, author: { login: "ada" }, files: [{ filename: "services/api/x.ts" }] });
    let commits = [commit("a".repeat(40), "2026-05-01T10:00:00Z", "feat: decided to use Postgres for storage")];
    let etag = '"v1"';
    const fakeFetch: FetchLike = async (url, init) => {
      const u = new URL(url);
      if (u.pathname.endsWith("/commits")) {
        if ((init?.headers as Record<string, string>)?.["If-None-Match"] === etag) return new Response(null, { status: 304 });
        return new Response(JSON.stringify(commits), { status: 200, headers: { etag } });
      }
      return new Response("[]", { status: 200 });
    };
    const opts = { key: () => randomId("src"), fetchImpl: fakeFetch, access: "TEAM" as const };
    const run = (raw: Awaited<ReturnType<typeof fetchGithubDelta>>["sources"]) => ingestIncremental(p.id, raw, { actor: meera, reason: "sync" });

    const d1 = await fetchGithubDelta("ada/app", { lastCommitDate: null, issuesSince: "2026-01-01T00:00:00Z", pullsSince: "2026-01-01T00:00:00Z" }, opts);
    expect(d1.counts.commits).toBe(1);
    const r1 = await run(d1.sources);
    expect(r1.ingest.newItems).toBe(1);

    const d2 = await fetchGithubDelta("ada/app", d1.cursor, opts);
    expect(d2.notModified).toBe(true);
    expect(d2.sources).toHaveLength(0);

    commits = [...commits, commit("b".repeat(40), "2026-05-02T10:00:00Z", "fix: switched to connection pooling")];
    etag = '"v2"';
    const d3 = await fetchGithubDelta("ada/app", d1.cursor, opts);
    const r3 = await run(d3.sources);
    expect(r3.ingest.newItems).toBe(1);
    expect(r3.ingest.skippedItems).toBe(1);
    expect(await prisma.source.count({ where: { projectId: p.id } })).toBe(1);

    const r4 = await run(d3.sources);
    expect(r4.runId).toBeNull();
    expect(await prisma.chunk.count({ where: { source: { projectId: p.id } } })).toBe(2);
  }, 60_000);

  it("cleanup removes expired sandboxes but never the template", async () => {
    const p = await resetSandbox("vitest-old-0001");
    await prisma.project.update({ where: { id: p.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const r = await cleanupExpired();
    expect(r.deleted).toBeGreaterThanOrEqual(1);
    expect(await prisma.project.count({ where: { id: p.id } })).toBe(0);
    expect(await prisma.project.count({ where: { slug: "festflow", kind: "TEMPLATE" } })).toBe(1);
  }, 60_000);
});
