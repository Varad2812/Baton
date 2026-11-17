// Builds public/samples/festflow-slack-export.zip from seed/slack-demo/messages.json in the exact
// layout of an official Slack export (users.json, channels.json, groups.json, <channel>/<day>.json).
// Deterministic: same input -> same ZIP. Run: npm run slack:sample
import { writeFileSync } from "node:fs";
import path from "node:path";
import { strToU8, zipSync } from "fflate";
import data from "../seed/slack-demo/messages.json";

const day = (ts: string) => new Date(Number(ts) * 1000).toISOString().slice(0, 10);
const files: Record<string, Uint8Array> = {};
const put = (name: string, v: unknown) => (files[name] = strToU8(JSON.stringify(v, null, 2)));

put("users.json", data.users.map((u) => ({ id: u.id, name: u.name, real_name: u.real_name, profile: { real_name: u.real_name, display_name: u.real_name } })));
const meta = (c: (typeof data.channels)[number]) => ({ id: c.id, name: c.name, created: 1767225600, is_private: c.private, members: data.users.map((u) => u.id) });
put("channels.json", data.channels.filter((c) => !c.private).map(meta));
put("groups.json", data.channels.filter((c) => c.private).map(meta));
for (const c of data.channels) {
  const byDay = new Map<string, unknown[]>();
  for (const m of c.messages) {
    const user = data.users.find((u) => u.id === m.user)!;
    const list = byDay.get(day(m.ts)) ?? [];
    list.push({ type: "message", user: m.user, text: m.text, ts: m.ts, user_profile: { real_name: user.real_name, display_name: user.real_name, name: user.name } });
    byDay.set(day(m.ts), list);
  }
  for (const [d, msgs] of byDay) put(`${c.name}/${d}.json`, msgs);
}
const zip = zipSync(files, { level: 9, mtime: new Date("2026-04-27T00:00:00Z") });
const out = path.join(__dirname, "..", "public", "samples", "festflow-slack-export.zip");
writeFileSync(out, zip);
console.log(`wrote ${out} (${zip.byteLength} bytes, ${Object.keys(files).length} files)`);
