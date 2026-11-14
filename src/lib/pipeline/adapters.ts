// Ingest adapters: export-shaped data -> RawSource. Pure (parsed input in, sources out).

import type { Access } from "@/generated/prisma/enums";
import type { RawItem, RawSource } from "./normalise";

const day = (iso: string) => iso.slice(0, 10);
const ist = (iso: string) => {
  // "2026-03-12T14:05:00.000+05:30" or UTC "Z" -> "2026-03-12 14:05" (IST)
  const d = new Date(iso);
  const t = new Date(d.getTime() + 5.5 * 3600_000).toISOString();
  return `${t.slice(0, 10)} ${t.slice(11, 16)}`;
};

/* --------------------------------- GitHub -------------------------------- */

type GhUser = { login: string };
export type GhCommit = {
  sha: string;
  html_url?: string;
  commit: { author: { name: string; email?: string; date: string }; message: string };
  author?: GhUser | null;
  files?: { filename: string }[];
};
export type GhPull = {
  number: number;
  html_url?: string;
  title: string;
  user: GhUser;
  state: string;
  draft?: boolean;
  merged?: boolean;
  merged_at?: string | null;
  closed_at?: string | null;
  created_at: string;
  labels?: { name: string }[];
  body?: string | null;
  review_comments?: { user: GhUser; created_at: string; path?: string; body: string }[];
};
export type GhIssue = {
  number: number;
  html_url?: string;
  title: string;
  user: GhUser;
  state: string;
  labels?: { name: string }[];
  assignees?: GhUser[];
  created_at: string;
  closed_at?: string | null;
  body?: string | null;
  comments?: { user: GhUser; created_at: string; body: string }[];
};

export function commitsSource(
  key: string,
  repo: string,
  commits: GhCommit[],
  access: Access = "PUBLIC",
): RawSource {
  const ordered = [...commits].sort(
    (a, b) => +new Date(a.commit.author.date) - +new Date(b.commit.author.date),
  );
  const items: RawItem[] = ordered.map((c) => {
    const s7 = c.sha.slice(0, 7);
    const login = c.author?.login;
    const files = c.files?.map((f) => f.filename).join(", ");
    return {
      text:
        `${s7} · ${day(c.commit.author.date)} · ${c.commit.author.name}${login ? ` (@${login})` : ""}\n` +
        `${c.commit.message.trim()}` +
        (files ? `\nfiles: ${files}` : ""),
      locator: `commit ${s7}`,
      pos: { label: "commits", from: s7, to: s7 },
      author: login ?? c.commit.author.name,
      timestamp: new Date(c.commit.author.date),
    };
  });
  const last = ordered[ordered.length - 1];
  return {
    key,
    kind: "GITHUB_COMMIT",
    title: `${repo} · commits on main`,
    uri: `https://github.com/${repo}/commits/main`,
    access,
    authoritative: false,
    createdAt: new Date(last?.commit.author.date ?? Date.now()),
    mergeItems: true,
    items,
  };
}

export function pullSource(key: string, pr: GhPull, access: Access = "PUBLIC"): RawSource {
  const merged = !!(pr.merged || pr.merged_at);
  const state = merged
    ? `merged ${day(pr.merged_at ?? pr.closed_at ?? pr.created_at)}`
    : pr.state === "closed"
      ? `closed without merge ${day(pr.closed_at ?? pr.created_at)}`
      : pr.draft
        ? "open (draft)"
        : "open";
  const labels = pr.labels?.length ? ` · labels: ${pr.labels.map((l) => l.name).join(", ")}` : "";
  const items: RawItem[] = [
    {
      text: `PR #${pr.number} · ${pr.title}\nby @${pr.user.login} · opened ${day(pr.created_at)} · ${state}${labels}\n\n${(pr.body ?? "").trim()}`,
      locator: `PR #${pr.number} description`,
      author: pr.user.login,
      timestamp: new Date(pr.created_at),
    },
    ...(pr.review_comments ?? []).map((c, i) => ({
      text: `PR #${pr.number} · review comment by @${c.user.login} · ${day(c.created_at)}${c.path ? ` · ${c.path}` : ""}\n${c.body.trim()}`,
      locator: `PR #${pr.number} comment ${i + 1}`,
      author: c.user.login,
      timestamp: new Date(c.created_at),
    })),
  ];
  return {
    key,
    kind: "GITHUB_PR",
    title: `PR #${pr.number} · ${pr.title}`,
    uri: pr.html_url,
    access,
    authoritative: merged,
    author: pr.user.login,
    createdAt: new Date(pr.created_at),
    mergeItems: false,
    items,
  };
}

export function issueSource(key: string, issue: GhIssue, access: Access = "PUBLIC"): RawSource {
  const labels = issue.labels?.length ? ` · labels: ${issue.labels.map((l) => l.name).join(", ")}` : "";
  const assignees = issue.assignees?.length
    ? issue.assignees.map((a) => `@${a.login}`).join(", ")
    : "none";
  const items: RawItem[] = [
    {
      text: `Issue #${issue.number} · ${issue.title}\nopened by @${issue.user.login} · ${day(issue.created_at)} · ${issue.state}${labels} · assignees: ${assignees}\n\n${(issue.body ?? "").trim()}`,
      locator: `Issue #${issue.number}`,
      author: issue.user.login,
      timestamp: new Date(issue.created_at),
    },
    ...(issue.comments ?? []).map((c, i) => ({
      text: `Issue #${issue.number} · comment by @${c.user.login} · ${day(c.created_at)}\n${c.body.trim()}`,
      locator: `Issue #${issue.number} comment ${i + 1}`,
      author: c.user.login,
      timestamp: new Date(c.created_at),
    })),
  ];
  return {
    key,
    kind: "GITHUB_ISSUE",
    title: `Issue #${issue.number} · ${issue.title}`,
    uri: issue.html_url,
    access,
    authoritative: false,
    author: issue.user.login,
    createdAt: new Date(issue.created_at),
    mergeItems: false,
    items,
  };
}

/* -------------------------------- Markdown ------------------------------- */

/** Paragraph items with line locators; headings stick to the following block. */
export function markdownSource(
  base: Omit<RawSource, "items" | "mergeItems" | "kind"> & { kind?: RawSource["kind"] },
  markdown: string,
): RawSource {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const items: RawItem[] = [];
  let start = -1;
  let buf: string[] = [];
  let inFence = false;
  const flush = (endIdx: number) => {
    if (!buf.length) return;
    const isHeadingOnly = buf.every((l) => /^#{1,6}\s/.test(l));
    if (isHeadingOnly) return; // keep accumulating into the next block
    const from = start + 1;
    const to = endIdx + 1;
    items.push({
      text: buf.join("\n"),
      locator: from === to ? `L${from}` : `L${from}-L${to}`,
      pos: { label: "lines", from: `L${from}`, to: `L${to}` },
      author: base.author,
      timestamp: base.createdAt,
    });
    buf = [];
    start = -1;
  };
  lines.forEach((line, i) => {
    if (/^```/.test(line)) inFence = !inFence;
    if (!inFence && line.trim() === "") {
      flush(i - 1);
      return;
    }
    if (start < 0) start = i;
    buf.push(line);
  });
  flush(lines.length - 1);
  return { kind: "DOC", mergeItems: true, ...base, items };
}

/* ---------------------------------- Chat --------------------------------- */

export type ChatExport = {
  guild?: { name: string };
  channels: {
    channel: { name: string };
    messages: {
      timestamp: string;
      content: string;
      author: { name: string; nickname?: string };
    }[];
  }[];
};

export function chatSources(
  exp: ChatExport,
  opts: (channel: string) => { key: string; access: Access },
): RawSource[] {
  return exp.channels.map((c) => {
    const { key, access } = opts(c.channel.name);
    const items: RawItem[] = c.messages.map((m, i) => {
      const n = String(i + 1);
      const who = m.author.nickname ? `${m.author.nickname} (@${m.author.name})` : `@${m.author.name}`;
      return {
        text: `[${ist(m.timestamp)}] ${who}: ${m.content}`,
        locator: `#${c.channel.name} msg ${n}`,
        pos: { label: `#${c.channel.name} msg`, from: n, to: n },
        author: m.author.name,
        timestamp: new Date(m.timestamp),
      };
    });
    return {
      key,
      kind: "CHAT",
      title: `Discord #${c.channel.name}${exp.guild ? ` · ${exp.guild.name}` : ""}`,
      access,
      authoritative: false,
      createdAt: new Date(c.messages[c.messages.length - 1]?.timestamp ?? Date.now()),
      mergeItems: true,
      items,
    };
  });
}

/* ----------------------------------- CSV --------------------------------- */

export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  const s = input.replace(/\r\n/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

/** Trello CSV export: one item per card. */
export function trelloSource(
  base: Omit<RawSource, "items" | "mergeItems" | "kind">,
  csv: string,
): RawSource {
  const [header, ...rows] = parseCsv(csv);
  const col = (r: string[], name: string) => r[header.indexOf(name)] ?? "";
  const items: RawItem[] = rows.map((r) => {
    const id = col(r, "Card ID");
    const meta = [
      `List: ${col(r, "List")}`,
      col(r, "Labels") && `Labels: ${col(r, "Labels")}`,
      `Members: ${col(r, "Members") || "unassigned"}`,
      col(r, "Due Date") && `Due: ${col(r, "Due Date")}`,
    ]
      .filter(Boolean)
      .join(" · ");
    const desc = col(r, "Description");
    return {
      text: `${id} · ${col(r, "Card Name")}\n${meta}${desc ? `\n${desc}` : ""}`,
      locator: `card ${id}`,
      pos: { label: "cards", from: id, to: id },
      author: col(r, "Members").split(",")[0]?.trim() || undefined,
      timestamp: col(r, "Last Activity") ? new Date(`${col(r, "Last Activity")}T12:00:00+05:30`) : undefined,
    };
  });
  return { kind: "TASKS", mergeItems: true, ...base, items };
}

/** Generic CSV sheet: one item per row, "Header: value" pairs. */
export function sheetSource(
  base: Omit<RawSource, "items" | "mergeItems" | "kind">,
  csv: string,
): RawSource {
  const [header, ...rows] = parseCsv(csv);
  const items: RawItem[] = rows.map((r, i) => {
    const n = String(i + 2); // spreadsheet row number (row 1 = header)
    const pairs = header
      .map((h, j) => (r[j]?.trim() ? `${h}: ${r[j].trim()}` : ""))
      .filter(Boolean)
      .join(" · ");
    return {
      text: `Row ${n} · ${pairs}`,
      locator: `row ${n}`,
      pos: { label: "rows", from: n, to: n },
      author: base.author,
      timestamp: base.createdAt,
    };
  });
  return { kind: "DOC", mergeItems: true, ...base, items };
}
