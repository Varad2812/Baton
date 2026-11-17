"use server";

// Continuous handover actions: Sync now (GitHub, incremental) and the sample project's
// "Simulate new activity". Both run the same incremental pipeline and never rewrite reviewed facts.
import { refresh } from "next/cache";
import { errorResult, okResult, type ActionResult } from "@/lib/action-result";
import { changeSummary } from "@/lib/handover/changes";
import type { IncrementalResult } from "@/lib/pipeline/incremental";
import { actionContext } from "@/lib/server/action-context";
import { pendingChanges, simulateActivity, syncGithub } from "@/lib/sync/service";
import { syncSlack } from "@/lib/connectors/slack/service";
import { prisma } from "@/lib/db";

export type SyncActionData = { newFacts: number; confirmed: number; contradicts: number; supersedes: number; newItems: number; summary: string };

function describe(r: IncrementalResult | null, summary: string): SyncActionData {
  return {
    newFacts: r?.newFacts.length ?? 0,
    confirmed: r?.confirmed.length ?? 0,
    contradicts: r?.conflicts.contradicts ?? 0,
    supersedes: r?.conflicts.supersedes ?? 0,
    newItems: r?.ingest.newItems ?? 0,
    summary,
  };
}

export async function simulateNewActivity(slug: string): Promise<ActionResult<SyncActionData>> {
  try {
    const { actor, project } = await actionContext(slug, "connect_sources");
    const r = await simulateActivity(actor, project);
    refresh();
    if (!r.runId) return okResult("Nothing new: the simulated activity is already in this project. Reset demo to replay it.", describe(r, ""));
    const ch = await pendingChanges(actor, project.id);
    const summary = ch ? changeSummary(ch) : "";
    return okResult(
      `Simulated activity ingested: ${r.ingest.newItems} new items, ${r.newFacts.length} new facts, ${r.conflicts.contradicts} contradiction, ${r.confirmed.length} newly confirmed.${ch ? ` v${ch.version} is now out of date.` : " Approve v1 first to see what changes after approval."}`,
      describe(r, summary),
    );
  } catch (e) {
    return errorResult(e);
  }
}

export async function syncNow(slug: string): Promise<ActionResult<SyncActionData>> {
  try {
    const { actor, project } = await actionContext(slug, "connect_sources");
    const [gh, slack] = await Promise.all([
      prisma.syncState.count({ where: { projectId: project.id, provider: "github" } }),
      prisma.syncState.count({ where: { projectId: project.id, provider: "slack" } }),
    ]);
    if (!gh && !slack) return { ok: false, message: "Nothing to sync yet. Import a GitHub repo or Slack channels first." };
    const notes: string[] = [];
    let items = 0;
    let facts = 0;
    let contradicts = 0;
    let last: IncrementalResult | null = null;
    if (gh) {
      const s = await syncGithub(project.id, { actor });
      for (const f of s.repos.filter((x) => x.status === "error")) notes.push(`${f.repo}: ${f.error}`);
      last = s.result;
      items += s.result?.ingest.newItems ?? 0;
      facts += s.result?.newFacts.length ?? 0;
      contradicts += s.result?.conflicts.contradicts ?? 0;
    }
    if (slack) {
      for (const r of await syncSlack(actor, project)) {
        for (const s of r.skipped) notes.push(`#${s.name}: ${s.reason}`);
        last = r.result ?? last;
        items += r.result?.ingest.newItems ?? 0;
        facts += r.result?.newFacts.length ?? 0;
        contradicts += r.result?.conflicts.contradicts ?? 0;
      }
    }
    refresh();
    const base = items ? `Synced: ${items} new items, ${facts} new facts, ${contradicts} contradictions.` : "Synced: nothing changed since the last sync.";
    return okResult(notes.length ? `${base} ${notes.join(" ")}` : base, { ...describe(last, ""), newItems: items, newFacts: facts, contradicts });
  } catch (e) {
    return errorResult(e);
  }
}
