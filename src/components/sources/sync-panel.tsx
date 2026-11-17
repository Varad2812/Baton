"use client";

import { useTransition } from "react";
import Link from "next/link";
import { FlaskConical, Loader2, RefreshCw } from "lucide-react";
import { simulateNewActivity, syncNow } from "@/app/_actions/sync";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { useActionToast } from "@/components/ui/toast";

export type SyncRow = { repo: string; provider: string; lastSyncedAt: string | null; lastStatus: string | null; lastError: string | null };

/** Sync now (connected repos) and, on the sample project, Simulate new activity. Owner only. */
export function SyncPanel({
  slug,
  canSync,
  ownerName,
  repos,
  demo,
  simulated,
  approved,
}: {
  slug: string;
  canSync: boolean;
  ownerName: string;
  repos: SyncRow[];
  demo: boolean;
  /** The simulated batch is already in this project. */
  simulated: boolean;
  approved: boolean;
}) {
  const [syncing, startSync] = useTransition();
  const [simulating, startSim] = useTransition();
  const toast = useActionToast();
  const why = canSync ? null : `Only ${ownerName} (the owner) connects and syncs sources. Switch persona in Viewing as.`;
  const busy = syncing || simulating;

  const wrap = (btn: React.ReactNode) => (why ? <Tooltip content={why}>{btn}</Tooltip> : btn);

  return (
    <div className="space-y-3 px-4 pb-4 text-[13px]">
      {repos.length > 0 ? (
        <ul className="space-y-1.5" data-testid="sync-repos">
          {repos.map((r) => (
            <li key={`${r.provider}:${r.repo}`} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate font-mono text-xs text-text">{r.repo}</span>
              <span className={r.lastStatus === "error" ? "shrink-0 text-xs text-conflicting" : "shrink-0 text-xs text-subtle"} title={r.lastError ?? undefined}>
                {r.lastStatus === "error" ? "last sync failed" : r.lastSyncedAt ? `synced ${new Date(r.lastSyncedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}` : "not synced"}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted">
          {demo
            ? "The sample project's sources are fixtures, so there is nothing live to sync. Use Simulate new activity to see the same incremental sync, or import a public GitHub repo or Slack channels and then Sync now."
            : "No repository or Slack channel connected for sync yet. Import a public GitHub repo or Slack channels; Sync now then fetches only what is new."}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {wrap(
          <Button
            size="sm"
            variant="outline"
            data-sync-now
            disabled={!canSync || busy || repos.length === 0}
            onClick={() => startSync(async () => toast(await syncNow(slug)))}
          >
            {syncing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            Sync now
          </Button>,
        )}
        {demo &&
          wrap(
            <Button
              size="sm"
              data-simulate
              disabled={!canSync || busy || simulated}
              onClick={() => startSim(async () => toast(await simulateNewActivity(slug)))}
            >
              {simulating ? <Loader2 className="size-3.5 animate-spin" /> : <FlaskConical className="size-3.5" />}
              {simulated ? "Simulated activity added" : "Simulate new activity"}
            </Button>,
          )}
      </div>
      {demo && (
        <p className="text-xs text-subtle">
          Simulated: injects 3 prepared commits and 6 chat messages from 24–26 Apr through the same incremental path as Sync now (redact, chunk, extract, verify, grade).
          {!approved && " Approve v1 first to see the “out of date” banner and Draft v2."}
          {simulated && (
            <>
              {" "}
              <Link href={`/p/${slug}/review?changes=1`} className="text-primary hover:underline">
                Review the changes
              </Link>
            </>
          )}
        </p>
      )}
    </div>
  );
}
