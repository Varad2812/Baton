import { describe, expect, it } from "vitest";
import { fileToRawSources, type UploadFile } from "./files";
import { importGithubRepo, parseRepo } from "./github";

const enc = (s: string) => new TextEncoder().encode(s);
const file = (name: string, text: string): UploadFile => ({ name, bytes: enc(text) });
let n = 0;
const opts = { access: "TEAM" as const, key: () => `src_t${++n}` };

describe("fileToRawSources", () => {
  it("markdown and text become DOC sources with line locators", async () => {
    const [s] = await fileToRawSources(file("notes.md", "# Title\n\nFirst para.\n\nSecond para."), opts);
    expect(s.kind).toBe("DOC");
    expect(s.items.map((i) => i.locator)).toEqual(["L1-L3", "L5"]);
    const [t] = await fileToRawSources(file("plain.txt", "hello world"), opts);
    expect(t.kind).toBe("DOC");
  });

  it("CSV: Trello export -> TASKS, any other sheet -> DOC rows", async () => {
    const [trello] = await fileToRawSources(file("board.csv", "Card ID,Card Name,List,Members\nFF-1,Do it,Doing,arjun"), opts);
    expect(trello.kind).toBe("TASKS");
    expect(trello.items[0].locator).toBe("card FF-1");
    const [sheet] = await fileToRawSources(file("budget.csv", "Item,Amount\nStage,5000"), opts);
    expect(sheet.kind).toBe("DOC");
    expect(sheet.items[0].text).toBe("Row 2 · Item: Stage · Amount: 5000");
  });

  it("JSON: Discord multi-channel, Discord single-channel, Slack array and Slack {messages}", async () => {
    const msg = { timestamp: "2026-03-12T08:00:00Z", content: "auth moved", author: { name: "meera-k" } };
    const multi = await fileToRawSources(file("d.json", JSON.stringify({ channels: [{ channel: { name: "dev" }, messages: [msg] }, { channel: { name: "pay" }, messages: [msg] }] })), opts);
    expect(multi.map((s) => s.title)).toEqual(["Discord #dev", "Discord #pay"]);

    const single = await fileToRawSources(file("x.json", JSON.stringify({ guild: { name: "Club" }, channel: { name: "general" }, messages: [msg] })), opts);
    expect(single[0].title).toBe("Discord #general · Club");

    const slack = [
      { type: "message", user: "U1", user_profile: { name: "meera", real_name: "Meera Kulkarni" }, text: "second", ts: "1712345700.0001" },
      { type: "message", user: "U2", text: "first", ts: "1712345600.0001" },
      { type: "message", subtype: "channel_join", user: "U3", text: "joined", ts: "1712345650.0001" },
    ];
    const [s1] = await fileToRawSources(file("payments.json", JSON.stringify(slack)), opts);
    expect(s1.kind).toBe("CHAT");
    expect(s1.title).toBe("Discord #payments");
    expect(s1.items.map((i) => i.text.split(": ").slice(1).join(": "))).toEqual(["first", "second"]);
    expect(s1.items[1].text).toContain("Meera Kulkarni (@meera)");

    const [s2] = await fileToRawSources(file("dev.json", JSON.stringify({ messages: slack })), opts);
    expect(s2.items).toHaveLength(2);
  });

  it("rejects unsupported types, empty files, bad JSON and unknown JSON shapes", async () => {
    await expect(fileToRawSources(file("a.pdf", "x"), opts)).rejects.toThrow(/unsupported/);
    await expect(fileToRawSources({ name: "a.md", bytes: new Uint8Array() }, opts)).rejects.toThrow(/empty/);
    await expect(fileToRawSources(file("a.json", "{nope"), opts)).rejects.toThrow(/not valid JSON/);
    await expect(fileToRawSources(file("a.json", '{"foo":1}'), opts)).rejects.toThrow(/Discord or Slack/);
  });
});

describe("GitHub import", () => {
  it("parses owner/repo and URLs", () => {
    expect(parseRepo("vercel/next.js")).toEqual({ owner: "vercel", repo: "next.js" });
    expect(parseRepo("https://github.com/festflow-club/festflow.git")).toEqual({ owner: "festflow-club", repo: "festflow" });
    expect(parseRepo("https://github.com/a/b/tree/main/src")).toEqual({ owner: "a", repo: "b" });
    expect(() => parseRepo("not a repo")).toThrow(/owner\/repo/);
  });

  it("maps commits, PRs (+review comments), issues (minus PRs) and README", async () => {
    const routes: Record<string, unknown> = {
      "/repos/o/r": { full_name: "o/r", default_branch: "main", private: false },
      "/repos/o/r/commits?per_page=100": [{ sha: "abcdef1234", commit: { author: { name: "M", date: "2026-03-01T00:00:00Z" }, message: "init" }, author: { login: "m" } }],
      "/repos/o/r/pulls?state=all&sort=updated&direction=desc&per_page=100": [{ number: 84, title: "Supabase", user: { login: "m" }, state: "closed", merged_at: "2026-03-12T00:00:00Z", created_at: "2026-03-10T00:00:00Z", body: "Move auth" }],
      "/repos/o/r/pulls/84/comments?per_page=50": [{ user: { login: "k" }, created_at: "2026-03-11T00:00:00Z", body: "LGTM" }],
      "/repos/o/r/issues?state=all&sort=updated&direction=desc&per_page=100": [
        { number: 84, title: "PR", user: { login: "m" }, state: "closed", created_at: "2026-03-10T00:00:00Z", pull_request: {} },
        { number: 31, title: "Build fails on Windows", user: { login: "k" }, state: "open", created_at: "2026-01-21T00:00:00Z", comments: 1 },
      ],
      "/repos/o/r/issues/31/comments?per_page=50": [{ user: { login: "m" }, created_at: "2026-01-22T00:00:00Z", body: "use WSL" }],
      "/repos/o/r/readme": { content: Buffer.from("# R\n\nHello").toString("base64"), encoding: "base64", path: "README.md" },
    };
    const fetchImpl = async (url: string) => {
      const path = url.replace("https://api.github.com", "");
      return path in routes ? Response.json(routes[path]) : new Response("{}", { status: 404 });
    };
    let k = 0;
    const imp = await importGithubRepo("https://github.com/o/r", { key: () => `src_${++k}`, fetchImpl });
    expect(imp.counts).toEqual({ commits: 1, pulls: 1, issues: 1, readme: 1 });
    expect(imp.sources.map((s) => s.kind)).toEqual(["GITHUB_COMMIT", "GITHUB_PR", "GITHUB_ISSUE", "DOC"]);
    const pr = imp.sources[1];
    expect(pr.authoritative).toBe(true); // merged
    expect(pr.items.map((i) => i.locator)).toEqual(["PR #84 description", "PR #84 comment 1"]);
    expect(imp.sources[2].items[1].text).toContain("use WSL");
    expect(imp.sources.every((s) => s.access === "PUBLIC")).toBe(true);
  });

  it("explains a missing repo and the rate limit", async () => {
    const notFound = async () => new Response("{}", { status: 404 });
    await expect(importGithubRepo("o/r", { key: () => "s", fetchImpl: notFound })).rejects.toThrow(/not found/);
    const limited = async () => new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "0" } });
    await expect(importGithubRepo("o/r", { key: () => "s", fetchImpl: limited })).rejects.toThrow(/rate limit/);
  });
});
