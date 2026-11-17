// Slack -> Baton (pure): one importer for the demo workspace, OAuth workspaces and export ZIPs.
//   visibility: public channel -> TEAM, private channel / DM / group DM -> RESTRICTED (owner can override)
//   identity:   Slack users are matched to project people by name; their handles join the identity map
//   messages:   mrkdwn cleaned (<@U1> -> @name, <#C1|dev> -> #dev, <url|label> -> label (url)),
//               joins/leaves skipped, each message keeps its permalink and its ts as the item key
import type { Access } from "@/generated/prisma/enums";
import type { RawItem, RawSource } from "@/lib/pipeline/normalise";
import type { SlackMessage, SlackUser } from "./client";

export type ChannelDump = {
  id: string;
  name: string;
  kind: "public" | "private" | "dm";
  members?: number;
  messages: SlackMessage[];
};

export function accessFor(kind: ChannelDump["kind"], override?: Access | null): Access {
  if (override) return override;
  return kind === "public" ? "TEAM" : "RESTRICTED";
}

const SKIP = new Set(["channel_join", "channel_leave", "channel_topic", "channel_purpose", "channel_name", "channel_archive", "channel_unarchive", "group_join", "group_leave", "pinned_item", "bot_add", "bot_remove"]);

export function userLabel(u: SlackUser | undefined, fallback: string): string {
  return u?.profile?.display_name || u?.profile?.real_name || u?.real_name || u?.name || fallback;
}

export function cleanText(text: string, users: Map<string, SlackUser>): string {
  return text
    .replace(/<@([UW][A-Z0-9]+)(?:\|([^>]+))?>/g, (_, id, label) => `@${label ?? userLabel(users.get(id), id)}`)
    .replace(/<#([C][A-Z0-9]+)(?:\|([^>]*))?>/g, (_, id, name) => `#${name || id}`)
    .replace(/<!(here|channel|everyone)>/g, "@$1")
    .replace(/<(https?:[^|>]+)\|([^>]+)>/g, "$2 ($1)")
    .replace(/<(https?:[^>]+)>/g, "$1")
    .replace(/<mailto:([^|>]+)\|[^>]+>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

export function permalink(teamUrl: string | null, channelId: string, ts: string): string | undefined {
  if (!teamUrl) return undefined;
  return `${teamUrl.replace(/\/$/, "")}/archives/${channelId}/p${ts.replace(".", "")}`;
}

const ist = (ts: string) => {
  const d = new Date(Number(ts) * 1000 + 5.5 * 3600_000).toISOString();
  return `${d.slice(0, 10)} ${d.slice(11, 16)}`;
};

export function channelToRaw(
  ch: ChannelDump,
  o: { key: string; team: { id: string; name: string; url: string | null }; users: Map<string, SlackUser>; access?: Access | null },
): RawSource {
  const msgs = ch.messages
    .filter((m) => (m.type ?? "message") === "message" && !SKIP.has(m.subtype ?? "") && (m.text ?? "").trim())
    .filter((m) => !m.subtype || m.subtype === "bot_message" || m.subtype === "thread_broadcast" || m.subtype === "file_share")
    .sort((a, b) => Number(a.ts) - Number(b.ts));
  const items: RawItem[] = msgs.map((m, i) => {
    const u = m.user ? o.users.get(m.user) : undefined;
    const handle = u?.name ?? m.user_profile?.name ?? m.username ?? m.user ?? "unknown";
    const display = userLabel(u, m.user_profile?.display_name || m.user_profile?.real_name || m.username || handle);
    const who = display && display !== handle ? `${display} (@${handle})` : `@${handle}`;
    return {
      text: `[${ist(m.ts)}] ${who}: ${cleanText(m.text ?? "", o.users)}`,
      locator: `#${ch.name} msg ${i + 1}`,
      pos: { label: `#${ch.name} msg`, from: String(i + 1), to: String(i + 1) },
      author: handle,
      timestamp: new Date(Number(m.ts) * 1000),
      key: m.ts,
      permalink: permalink(o.team.url, ch.id, m.ts),
    };
  });
  const last = msgs.at(-1);
  return {
    key: o.key,
    externalId: `slack:${o.team.id}:${ch.id}`,
    kind: "CHAT",
    title: `Slack #${ch.name} · ${o.team.name}${ch.kind === "public" ? "" : ch.kind === "dm" ? " (direct messages)" : " (private)"}`,
    uri: o.team.url ? `${o.team.url.replace(/\/$/, "")}/archives/${ch.id}` : undefined,
    access: accessFor(ch.kind, o.access),
    authoritative: false,
    createdAt: last ? new Date(Number(last.ts) * 1000) : new Date(),
    mergeItems: true,
    items,
  };
}

/** Slack users who match a project person by full name, display name or first name -> handles to add. */
export function matchUsers(users: SlackUser[], people: { id: string; name: string; handles: string[] }[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const norm = (s: string) => s.trim().toLowerCase().replace(/^prof\.\s*/, "");
  for (const u of users) {
    if (u.deleted || u.is_bot) continue;
    const names = [u.profile?.real_name, u.real_name, u.profile?.display_name, u.name].filter((x): x is string => !!x);
    const p = people.find((pp) => {
      const full = norm(pp.name);
      const hs = pp.handles.map(norm);
      return names.some((n) => norm(n) === full || hs.includes(norm(n)));
    });
    if (!p) continue;
    const add = [u.name, u.profile?.display_name, u.profile?.real_name].filter((x): x is string => !!x && !p.handles.includes(x));
    if (add.length) out.set(p.id, [...new Set([...(out.get(p.id) ?? []), ...add])]);
  }
  return out;
}
