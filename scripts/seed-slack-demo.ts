// Seeds the pre-connected demo Slack workspace (SLACK_BOT_TOKEN) with the FestFlow sample channels
// from seed/slack-demo/messages.json. Needs these bot scopes in addition to the read scopes:
//   channels:manage, groups:write, chat:write, chat:write.customize
// Idempotent: existing channels are reused and messages already posted (same text) are skipped.
// Run: npm run slack:seed-demo   (prints what it will do; add --yes to post)
import "dotenv/config";
import data from "../seed/slack-demo/messages.json";

const token = process.env.SLACK_BOT_TOKEN?.trim();
if (!token) throw new Error("SLACK_BOT_TOKEN is not set");
const yes = process.argv.includes("--yes");
const NEEDED = ["channels:manage", "channels:join", "groups:write", "chat:write", "chat:write.customize"];

async function api<T>(method: string, body: Record<string, unknown> = {}): Promise<T & { ok: boolean; error?: string }> {
  const res = await fetch(`https://slack.com/api/${method}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json; charset=utf-8" }, body: JSON.stringify(body) });
  const j = (await res.json()) as T & { ok: boolean; error?: string };
  if (!j.ok) throw new Error(`${method}: ${j.error}`);
  return j;
}

async function main() {
  const res = await fetch("https://slack.com/api/auth.test", { headers: { Authorization: `Bearer ${token}` } });
  const scopes = (res.headers.get("x-oauth-scopes") ?? "").split(",");
  const missing = NEEDED.filter((s) => !scopes.includes(s));
  console.log(`workspace: ${(await res.json()).team}; missing scopes: ${missing.join(", ") || "none"}`);
  console.log(`plan: ${data.channels.map((c) => `#${c.name}${c.private ? " (private)" : ""}: ${c.messages.length} messages`).join("; ")}`);
  if (missing.length) {
    console.log("Add the missing bot scopes in the Slack app settings (OAuth & Permissions), reinstall to the workspace, update SLACK_BOT_TOKEN, then rerun.");
    process.exit(2);
  }
  if (!yes) return console.log("Dry run. Rerun with --yes to create the channels and post the messages.");
  const list = await api<{ channels: { id: string; name: string }[] }>("conversations.list", { types: "public_channel,private_channel", limit: 500 });
  for (const c of data.channels) {
    let ch = list.channels.find((x) => x.name === c.name);
    if (!ch) ch = (await api<{ channel: { id: string; name: string } }>("conversations.create", { name: c.name, is_private: c.private })).channel;
    else await api("conversations.join", { channel: ch.id }).catch(() => undefined);
    const hist = await api<{ messages: { text: string }[] }>("conversations.history", { channel: ch.id, limit: 200 });
    for (const m of c.messages) {
      const user = data.users.find((u) => u.id === m.user)!;
      const text = m.text.replace(/<@(U[A-Z0-9]+)>/g, (_, id) => `@${data.users.find((u) => u.id === id)?.real_name ?? id}`);
      if (hist.messages.some((h) => h.text === text)) continue;
      await api("chat.postMessage", { channel: ch.id, text, username: user.real_name });
      console.log(`posted to #${c.name}: ${text.slice(0, 60)}…`);
    }
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
