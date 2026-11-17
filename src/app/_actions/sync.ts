"use server";

// Continuous handover actions: Sync now (GitHub, incremental) and the sample project's
// "Simulate new activity". Both run the same incremental pipeline and never rewrite reviewed facts.
import { refresh } from "next/cache";
import { errorResult, okResult, type ActionResult } from "@/lib/action-result";
import { changeSummary } from "@/lib/handover/changes";
import type { IncrementalResult } from "@/lib/pipeline/incremental";
import { actionContext } from "@/lib/server/action-context";
import { pendingChanges, simulateActivity, syncGithub } from "@/lib/sync/service";

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
    const s = await syncGithub(project.id, { actor });
    refresh();
    const failed = s.repos.filter((r) => r.status === "error");
    const r = s.result;
    const base = r?.runId
      ? `Synced: ${r.ingest.newItems} new items, ${r.newFacts.length} new facts, ${r.conflicts.contradicts} contradictions.`
      : "Synced: nothing changed since the last sync.";
    return okResult(failed.length ? `${base} ${failed.map((f) => `${f.repo}: ${f.error}`).join(" ")}` : base, describe(r, ""));
  } catch (e) {
    return errorResult(e);
  }
}
