"use client";

// Slack on Add sources: import from the pre-connected demo workspace (no Slack login needed),
// connect your own workspace (OAuth), or upload an official Slack export ZIP. All three use one importer.
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileArchive, Loader2, Lock, MessageSquare, Plug, Users } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type Access = "PUBLIC" | "TEAM" | "RESTRICTED";
type Channel = { id: string; name: string; visibility: "public" | "private"; members: number; isMember: boolean; access: Access; topic: string };
type ImportReply = { team: string; imported: { name: string; messages: number; access: Access }[]; skipped?: { name: string; reason: string }[]; newItems: number; newFacts: number; peopleMatched: number };

const TIMEOUT = 120_000;

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { ...init, signal: ac.signal });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; issues?: { message: string }[] } & T;
    if (!res.ok || !j.ok) throw new Error(j.issues?.[0]?.message ?? j.error ?? `Request failed (HTTP ${res.status}).`);
    return j;
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error("Slack took too long to answer. Try fewer channels.");
    if (e instanceof TypeError) throw new Error("Network error. Check your connection and retry.");
    throw e;
  } finally {
    clearTimeout(t);
  }
}

const summary = (r: ImportReply) =>
  `${r.team}: ${r.imported.map((c) => `#${c.name} (${c.messages} messages, ${c.access.toLowerCase()})`).join(", ") || "nothing new"}. ${r.newItems} new messages, ${r.newFacts} new facts${r.peopleMatched ? `, ${r.peopleMatched} people matched` : ""}.${r.skipped?.length ? ` Skipped: ${r.skipped.map((s) => `#${s.name}: ${s.reason}`).join(" ")}` : ""}`;

export function SlackConnect({
  slug,
  canConnect,
  ownerName,
  config,
  connections,
  demo,
}: {
  slug: string;
  canConnect: boolean;
  ownerName: string;
  config: { oauth: boolean; demo: boolean };
  connections: { id: string; team: string }[];
  /** Sample project: offer the FestFlow sample export. */
  demo: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [ref, setRef] = useState<string | null>(null);
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [team, setTeam] = useState("");
  const [picked, setPicked] = useState<Record<string, Access | false>>({});
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const why = canConnect ? null : `Only ${ownerName} (the owner) connects sources. Switch persona in Viewing as.`;

  async function open(r: string) {
    setRef(r);
    setChannels(null);
    setError(null);
    setLoading(true);
    try {
      const j = await call<{ team: string; channels: Channel[] }>(`/api/projects/${slug}/connectors/slack/channels?ref=${encodeURIComponent(r)}`);
      setTeam(j.team);
      setChannels(j.channels);
      setPicked(Object.fromEntries(j.channels.filter((c) => c.isMember).map((c) => [c.id, c.access])));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function runImport() {
    if (!ref || importing) return;
    const chosen = Object.entries(picked).filter((e): e is [string, Access] => !!e[1]);
    if (!chosen.length) return setError("Pick at least one channel.");
    setImporting(true);
    setError(null);
    try {
      const r = await call<ImportReply>(`/api/projects/${slug}/connectors/slack/import`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ref, channels: chosen.map(([id, access]) => ({ id, access })) }),
      });
      setRef(null);
      toast({ title: "Slack imported", body: summary(r), tone: "success" });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setImporting(false);
    }
  }

  async function upload(f: File | Blob, name: string) {
    if (uploading) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", f, name);
      const r = await call<ImportReply>(`/api/projects/${slug}/sources/slack-export`, { method: "POST", body: fd });
      toast({ title: "Slack export imported", body: summary(r), tone: "success" });
      router.refresh();
    } catch (e) {
      toast({ title: "Slack export not imported", body: (e as Error).message, tone: "danger" });
    } finally {
      setUploading(false);
      if (file.current) file.current.value = "";
    }
  }

  async function sample() {
    try {
      const res = await fetch("/samples/festflow-slack-export.zip", { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error();
      await upload(await res.blob(), "festflow-slack-export.zip");
    } catch {
      toast({ title: "Sample not loaded", body: "Could not load the sample export. Retry.", tone: "danger" });
    }
  }

  const btn = (node: React.ReactNode) => (why ? <Tooltip content={why}>{node}</Tooltip> : node);
  const notConfigured = "Slack sign-in is not configured on this server (SLACK_CLIENT_ID / SLACK_CLIENT_SECRET). Upload a Slack export ZIP instead.";

  return (
    <div className="space-y-4 text-[13px]" data-testid="slack-connect">
      <p className="text-muted">Public channels become Team; private channels and DMs become Restricted. You can change it per channel before importing.</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <SlackOption
          icon={<MessageSquare className="size-4" />}
          title="Use demo workspace"
          tag="no login"
          body="A real Slack workspace prepared for FestFlow: #dev, #payment and the private #leads-private."
        >
          {btn(
            <Button size="sm" className="w-full" disabled={!canConnect || !config.demo} onClick={() => open("demo")} data-slack-demo title={config.demo ? undefined : "The demo workspace is not configured on this server."}>
              Choose channels
            </Button>,
          )}
        </SlackOption>
        <SlackOption icon={<Plug className="size-4" />} title="Connect your Slack" body="Sign in with Slack (OAuth). The token is encrypted at rest and never sent to the browser.">
          {config.oauth && canConnect ? (
            <a href={`/api/connectors/slack/start?slug=${encodeURIComponent(slug)}`} className={buttonVariants({ size: "sm", variant: "outline", className: "w-full" })} data-slack-oauth>
              Connect Slack
            </a>
          ) : (
            <Tooltip content={why ?? notConfigured}>
              <Button size="sm" variant="outline" className="w-full" disabled data-slack-oauth>
                Connect Slack
              </Button>
            </Tooltip>
          )}
          {connections.length > 0 && (
            <ul className="mt-2 space-y-1">
              {connections.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-text">{c.team}</span>
                  {btn(
                    <Button size="sm" variant="ghost" disabled={!canConnect} onClick={() => open(`conn:${c.id}`)}>
                      Choose channels
                    </Button>,
                  )}
                </li>
              ))}
            </ul>
          )}
        </SlackOption>
        <SlackOption icon={<FileArchive className="size-4" />} title="Upload Slack export" body="The .zip a workspace admin downloads from Slack settings. Nothing to install.">
          <input ref={file} type="file" accept=".zip,application/zip" className="sr-only" id={`slack-zip-${slug}`} aria-label="Slack export ZIP file" tabIndex={-1} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], e.target.files[0].name)} disabled={!canConnect || uploading} />
          {btn(
            <Button size="sm" variant="outline" className="w-full" disabled={!canConnect || uploading} onClick={() => file.current?.click()} data-slack-export>
              {uploading && <Loader2 className="size-3.5 animate-spin" />}
              Upload .zip
            </Button>,
          )}
          {demo &&
            btn(
              <button type="button" className="mt-2 text-xs text-muted hover:text-text hover:underline disabled:opacity-50" disabled={!canConnect || uploading} onClick={sample} data-slack-sample>
                or try the FestFlow sample export
              </button>,
            )}
        </SlackOption>
      </div>

      <Dialog
        open={ref !== null}
        onOpenChange={(o) => !o && !importing && setRef(null)}
        title={team ? `Import from ${team}` : "Import from Slack"}
        description="History is imported up to 500 messages per channel; later syncs fetch only newer messages."
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setRef(null)} disabled={importing}>
              Cancel
            </Button>
            <Button size="sm" onClick={runImport} disabled={importing || loading || !Object.values(picked).some(Boolean)} data-slack-import>
              {importing && <Loader2 className="size-3.5 animate-spin" />}
              {importing ? "Importing…" : `Import ${Object.values(picked).filter(Boolean).length} channel${Object.values(picked).filter(Boolean).length === 1 ? "" : "s"}`}
            </Button>
          </>
        }
      >
        {loading && (
          <p className="flex items-center gap-2 text-[13px] text-muted">
            <Loader2 className="size-3.5 animate-spin" /> Reading the channel list…
          </p>
        )}
        {error && (
          <p role="alert" className="mb-2 rounded-md border border-conflicting/30 bg-conflicting/10 px-3 py-2 text-xs text-conflicting">
            {error}
          </p>
        )}
        {channels && channels.length === 0 && <p className="text-[13px] text-muted">No channels in this workspace. Create one and invite @Baton.</p>}
        {channels && channels.length > 0 && (
          <ul className="max-h-[360px] divide-y divide-border overflow-y-auto rounded-md border border-border" data-testid="slack-channels">
            {channels.map((c) => (
              <li key={c.id} className={cn("grid grid-cols-[20px_minmax(0,1fr)_auto] items-start gap-2 px-3 py-2", !c.isMember && "opacity-70")}>
                <input
                  type="checkbox"
                  aria-label={`Import #${c.name}`}
                  className="mt-1 accent-[var(--color-primary)]"
                  disabled={!c.isMember}
                  checked={!!picked[c.id]}
                  onChange={(e) => setPicked((p) => ({ ...p, [c.id]: e.target.checked ? c.access : false }))}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[13px] text-text">
                    {c.visibility === "private" && <Lock className="size-3 text-subtle" />}#{c.name}
                    <span className="inline-flex items-center gap-0.5 text-[11px] text-subtle">
                      <Users className="size-3" /> {c.members}
                    </span>
                  </div>
                  {c.isMember ? (
                    c.topic && <p className="truncate text-xs text-subtle">{c.topic}</p>
                  ) : (
                    <p className="text-xs text-primary">Baton is not in this channel. In Slack, type /invite @Baton in #{c.name}, then reopen this list.</p>
                  )}
                </div>
                <select
                  aria-label={`Access for #${c.name}`}
                  disabled={!c.isMember || !picked[c.id]}
                  value={(picked[c.id] || c.access) as string}
                  onChange={(e) => setPicked((p) => ({ ...p, [c.id]: e.target.value as Access }))}
                  className="rounded-md border border-border bg-bg px-1.5 py-1 text-xs text-text"
                >
                  <option value="PUBLIC">Public</option>
                  <option value="TEAM">Team</option>
                  <option value="RESTRICTED">Restricted</option>
                </select>
              </li>
            ))}
          </ul>
        )}
      </Dialog>
    </div>
  );
}

function SlackOption({ icon, title, tag, body, children }: { icon: React.ReactNode; title: string; tag?: string; body: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col rounded-lg border border-border bg-surface-2/40 p-4">
      <div className="flex items-center gap-2 text-text">
        <span className="text-subtle">{icon}</span>
        <span className="text-[14px] font-medium">{title}</span>
        {tag && <span className="rounded bg-verified/15 px-1.5 text-[11px] text-verified">{tag}</span>}
      </div>
      <p className="mt-1.5 flex-1 text-xs leading-relaxed text-muted">{body}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}
