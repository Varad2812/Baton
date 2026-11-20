import { createHash, createHmac } from "node:crypto";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { slackClient, type SlackUser } from "./client";
import { EXPORT_MSG_CAP, parseSlackExport } from "./export";
import { accessFor, channelToRaw, cleanText, matchUsers, permalink } from "./map";
import { checkState, makeState, verifySlackSignature } from "./oauth";

const users = new Map<string, SlackUser>([
  ["U1", { id: "U1", name: "meera.k", real_name: "Meera Kulkarni", profile: { real_name: "Meera Kulkarni", display_name: "Meera" } }],
  ["U2", { id: "U2", name: "arjun.m", real_name: "Arjun Mehta" }],
]);
const team = { id: "T1", name: "FestFlow", url: "https://festflow.slack.com/" };

describe("token encryption (AES-256-GCM)", () => {
  const key = createHash("sha256").update("k").digest();
  it("round-trips and uses a fresh IV each time", () => {
    const a = encryptSecret("xoxb-secret", key);
    expect(a).not.toContain("xoxb");
    expect(encryptSecret("xoxb-secret", key)).not.toBe(a);
    expect(decryptSecret(a, key)).toBe("xoxb-secret");
  });
  it("rejects tampering and the wrong key", () => {
    const a = encryptSecret("xoxb-secret", key);
    const parts = a.split(".");
    parts[3] = Buffer.from("xoxb-hacked").toString("base64url");
    expect(() => decryptSecret(parts.join("."), key)).toThrow();
    expect(() => decryptSecret(a, createHash("sha256").update("other").digest())).toThrow();
    expect(() => decryptSecret("plain-text", key)).toThrow();
  });
});

describe("permission mapping", () => {
  it("public -> TEAM, private and DMs -> RESTRICTED, owner override wins", () => {
    expect(accessFor("public")).toBe("TEAM");
    expect(accessFor("private")).toBe("RESTRICTED");
    expect(accessFor("dm")).toBe("RESTRICTED");
    expect(accessFor("private", "TEAM")).toBe("TEAM");
    expect(accessFor("public", "PUBLIC")).toBe("PUBLIC");
  });
  it("turns a channel into one CHAT source with keys, permalinks and clean text", () => {
    const raw = channelToRaw(
      {
        id: "C9",
        name: "dev",
        kind: "private",
        messages: [
          { ts: "1776931300.000200", user: "U2", text: "Agreed with <@U1>, see <https://x.dev/a|the doc> in <#C1|general> &amp; ship" },
          { ts: "1776931200.000100", user: "U1", text: "Deploys go through Render" },
          { ts: "1776931250.000150", subtype: "channel_join", user: "U2", text: "<@U2> has joined the channel" },
          { ts: "1776931260.000160", subtype: "bot_message", username: "Release bot", text: "v1.4 deployed" },
        ],
      },
      { key: "src_x", team, users },
    );
    expect(raw.access).toBe("RESTRICTED");
    expect(raw.externalId).toBe("slack:T1:C9");
    expect(raw.kind).toBe("CHAT");
    expect(raw.items.map((i) => i.key)).toEqual(["1776931200.000100", "1776931260.000160", "1776931300.000200"]);
    expect(raw.items[2].text).toContain("Agreed with @Meera, see the doc (https://x.dev/a) in #general & ship");
    expect(raw.items[0].permalink).toBe("https://festflow.slack.com/archives/C9/p1776931200000100");
    expect(raw.items[0].author).toBe("meera.k");
  });
  it("cleans special mentions and plain links", () => {
    expect(cleanText("<!here> read <https://a.b/c>", users)).toBe("@here read https://a.b/c");
    expect(permalink(null, "C1", "1.2")).toBeUndefined();
  });
  it("matches Slack users to project people by name", () => {
    const m = matchUsers([...users.values(), { id: "U3", name: "stranger", real_name: "Someone Else" }], [
      { id: "p1", name: "Meera Kulkarni", handles: ["meera_k"] },
      { id: "p2", name: "Arjun Mehta", handles: [] },
    ]);
    expect(m.get("p1")).toEqual(expect.arrayContaining(["meera.k", "Meera"]));
    expect(m.get("p2")).toEqual(["arjun.m"]);
    expect(m.size).toBe(2);
  });
});

describe("Slack export ZIP", () => {
  const zip = (files: Record<string, unknown>) => zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(JSON.stringify(v))])));
  it("reads public, private and DM channels with per-day files", () => {
    const ex = parseSlackExport(
      zip({
        "users.json": [...users.values()],
        "channels.json": [{ id: "C1", name: "dev" }],
        "groups.json": [{ id: "G1", name: "core", is_private: true }],
        "dms.json": [{ id: "D1", members: ["U1", "U2"] }],
        "dev/2026-04-01.json": [{ type: "message", ts: "1.1", user: "U1", text: "a" }],
        "dev/2026-04-02.json": [{ type: "message", ts: "2.1", user: "U2", text: "b" }],
        "core/2026-04-01.json": [{ type: "message", ts: "3.1", user: "U1", text: "c" }],
        "D1/2026-04-01.json": [{ type: "message", ts: "4.1", user: "U2", text: "d" }],
      }),
    );
    expect(ex.channels.map((c) => [c.name, c.kind, c.messages.length])).toEqual([
      ["dev", "public", 2],
      ["core", "private", 1],
      ["dm-D1", "dm", 1],
    ]);
    expect(ex.users).toHaveLength(2);
  });
  it("retains the latest decision in a capped export and returns messages in time order", () => {
    const earlierDay = Array.from({ length: EXPORT_MSG_CAP }, (_, i) => ({ ts: String(i + 1), text: "earlier" }));
    const latest = { ts: String(EXPORT_MSG_CAP + 2), text: "The revised plan is approved" };
    const { channels } = parseSlackExport(zip({
      "channels.json": [{ id: "C1", name: "dev" }],
      "dev/2026-04-02.json": [latest, { ts: String(EXPORT_MSG_CAP + 1), text: "proposal" }],
      "dev/2026-04-01.json": earlierDay,
    }));
    const messages = channels[0].messages;
    expect(messages).toHaveLength(EXPORT_MSG_CAP);
    expect(messages[0].ts).toBe("3");
    expect(messages.at(-1)).toEqual(latest);
  });

  it("explains what is wrong with a bad upload", () => {
    expect(() => parseSlackExport(strToU8("not a zip"))).toThrow(/not a ZIP/);
    expect(() => parseSlackExport(zip({ "readme.json": {} }))).toThrow(/No channels\.json/);
    expect(() => parseSlackExport(zip({ "channels.json": [{ id: "C1", name: "dev" }], "dev/2026-04-01.json": "{" }))).not.toThrow();
  });
});

describe("Slack client", () => {
  it("follows cursors and waits Retry-After on 429", async () => {
    const calls: string[] = [];
    const waits: number[] = [];
    let limited = true;
    const fetchImpl = async (url: string) => {
      calls.push(url);
      if (limited) {
        limited = false;
        return new Response("", { status: 429, headers: { "retry-after": "2" } });
      }
      const cursor = new URL(url).searchParams.get("cursor");
      const page = cursor === "p2" ? { channels: [{ id: "C2" }], response_metadata: { next_cursor: "" } } : { channels: [{ id: "C1" }], response_metadata: { next_cursor: "p2" } };
      return new Response(JSON.stringify({ ok: true, ...page }), { status: 200 });
    };
    const c = slackClient({ token: "t", fetchImpl, sleep: async (ms) => void waits.push(ms) });
    const r = await c.paginate<{ id: string }>("conversations.list", "channels", { limit: 1 });
    expect(r.items.map((x) => x.id)).toEqual(["C1", "C2"]);
    expect(waits).toEqual([2000]);
    expect(calls).toHaveLength(3);
  });
  it("caps history and turns Slack errors into next steps", async () => {
    const many = async () => new Response(JSON.stringify({ ok: true, messages: Array.from({ length: 200 }, (_, i) => ({ ts: `${i}.0` })), response_metadata: { next_cursor: "more" } }));
    const capped = await slackClient({ token: "t", fetchImpl: many }).paginate("conversations.history", "messages", {}, 500);
    expect(capped.items).toHaveLength(500);
    expect(capped.truncated).toBe(true);
    const notIn = async () => new Response(JSON.stringify({ ok: false, error: "not_in_channel" }));
    await expect(slackClient({ token: "t", fetchImpl: notIn }).call("conversations.history")).rejects.toThrow(/\/invite @Baton/);
  });
});

describe("OAuth state and request signatures", () => {
  it("accepts its own state and rejects tampering, expiry, another tab or another visitor", () => {
    const { state, nonce } = makeState("festflow-abc", "visitor-1", 1_000);
    expect(checkState(state, nonce, "visitor-1", 2_000)).toEqual({ ok: true, slug: "festflow-abc" });
    expect(checkState(state.replace(/.$/, (c) => (c === "A" ? "B" : "A")), nonce, "visitor-1", 2_000).ok).toBe(false);
    expect(checkState(state, nonce, "visitor-1", 1_000 + 11 * 60_000).ok).toBe(false);
    expect(checkState(state, "other-nonce", "visitor-1", 2_000).ok).toBe(false);
    expect(checkState(state, nonce, "visitor-2", 2_000).ok).toBe(false);
    expect(checkState(null, nonce, "visitor-1").ok).toBe(false);
  });
  it("verifies Slack v0 signatures inside a 5-minute window", () => {
    const body = "token=x&team_id=T1";
    const ts = "1700000000";
    const sig = `v0=${createHmac("sha256", "sec").update(`v0:${ts}:${body}`).digest("hex")}`;
    expect(verifySlackSignature(body, ts, sig, "sec", 1_700_000_100_000)).toBe(true);
    expect(verifySlackSignature(body, ts, sig, "sec", 1_700_000_400_000)).toBe(false);
    expect(verifySlackSignature(`${body}&x=1`, ts, sig, "sec", 1_700_000_100_000)).toBe(false);
    expect(verifySlackSignature(body, ts, sig, "", 1_700_000_100_000)).toBe(false);
  });
});
