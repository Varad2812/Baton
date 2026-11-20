// Official Slack export ZIP (Workspace settings > Import/Export data > Export):
//   users.json, channels.json (public), groups.json (private), dms.json / mpims.json (direct messages),
//   and one folder per conversation with one JSON array of messages per day.
// Parsed in memory with fflate under strict limits; public -> TEAM, private and DMs -> RESTRICTED.
import { unzipSync, strFromU8 } from "fflate";
import { BadRequestError } from "@/lib/http";
import type { SlackMessage, SlackUser } from "./client";
import type { ChannelDump } from "./map";

export const EXPORT_MAX_BYTES = 25 * 1024 * 1024;
export const EXPORT_MAX_ENTRIES = 5_000;
export const EXPORT_MAX_UNZIPPED = 100 * 1024 * 1024;
export const EXPORT_MSG_CAP = 2_000;

type Meta = { id: string; name?: string; members?: string[]; is_private?: boolean };

export function parseSlackExport(bytes: Uint8Array): { channels: ChannelDump[]; users: SlackUser[]; team: { id: string; name: string } } {
  if (bytes.byteLength > EXPORT_MAX_BYTES) throw new BadRequestError("Slack export is larger than 25 MB. Export a shorter date range.");
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new BadRequestError("This is not a ZIP file. Upload the .zip that Slack's export produces.");
  let total = 0;
  let count = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (f) => {
        count++;
        if (count > EXPORT_MAX_ENTRIES) throw new BadRequestError("Slack export has too many files (over 5,000).");
        total += f.originalSize;
        if (total > EXPORT_MAX_UNZIPPED) throw new BadRequestError("Slack export unpacks to more than 100 MB. Export a shorter date range.");
        return f.name.endsWith(".json") && !f.name.includes("..") && !f.name.startsWith("__MACOSX");
      },
    });
  } catch (e) {
    if (e instanceof BadRequestError) throw e;
    throw new BadRequestError("Could not read the ZIP file. It may be damaged; export it again.");
  }
  const strip = (name: string) => name.replace(/^[^/]+\/(?=(users|channels|groups|dms|mpims)\.json$|[^/]+\/\d{4}-\d{2}-\d{2}\.json$)/, "");
  const byName = new Map(Object.entries(files).map(([k, v]) => [strip(k), v]));
  const json = <T,>(name: string): T | null => {
    const f = byName.get(name);
    if (!f) return null;
    try {
      return JSON.parse(strFromU8(f)) as T;
    } catch {
      throw new BadRequestError(`${name} in the export is not valid JSON.`);
    }
  };
  const users = json<SlackUser[]>("users.json") ?? [];
  const lists: [Meta[] | null, ChannelDump["kind"]][] = [
    [json<Meta[]>("channels.json"), "public"],
    [json<Meta[]>("groups.json"), "private"],
    [json<Meta[]>("dms.json"), "dm"],
    [json<Meta[]>("mpims.json"), "dm"],
  ];
  if (lists.every(([l]) => !l)) throw new BadRequestError("No channels.json in this ZIP. Upload the export ZIP from Slack (Workspace settings > Import/Export data).");
  const channels: ChannelDump[] = [];
  for (const [list, kind] of lists) {
    for (const c of list ?? []) {
      const folder = c.name ?? c.id;
      const days = [...byName.keys()].filter((k) => k.startsWith(`${folder}/`) && /\d{4}-\d{2}-\d{2}\.json$/.test(k)).sort().reverse();
      const messages: SlackMessage[] = [];
      for (const d of days) {
        const arr = json<SlackMessage[]>(d);
        if (Array.isArray(arr)) {
          const newestFirst = arr.filter(m => m && typeof m.ts === "string")
            .sort((a, b) => Number(b.ts) - Number(a.ts));
          for (const message of newestFirst) {
            messages.push(message);
            if (messages.length === EXPORT_MSG_CAP) break;
          }
        }
        if (messages.length >= EXPORT_MSG_CAP) break;
      }
      channels.push({ id: c.id, name: c.name ?? (kind === "dm" ? `dm-${c.id}` : c.id), kind: c.is_private && kind === "public" ? "private" : kind, members: c.members?.length, messages: messages.reverse() });
    }
  }
  return { channels: channels.filter((c) => c.messages.length), users, team: { id: "export", name: "Slack export" } };
}
