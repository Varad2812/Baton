// Live import of a PUBLIC GitHub repo (or private with GITHUB_TOKEN) via REST:
// commits, PRs + review comments, issues + comments, README. Capped at 100 items per type.

import type { Access } from "@/generated/prisma/enums";
import { BadRequestError, HttpError } from "@/lib/http";
import { commitsSource, issueSource, markdownSource, pullSource, type GhCommit, type GhIssue, type GhPull } from "../adapters";
import type { RawSource } from "../normalise";

export const ITEM_CAP = 100;
const COMMENT_FETCH_CAP_NO_TOKEN = 25;
const COMMENT_FETCH_CAP_TOKEN = 100;

export function parseRepo(input: string): { owner: string; repo: string } {
  const s = input.trim().replace(/\.git$/, "").replace(/\/+$/, "");
  const m =
    s.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)(?:\/.*)?$/i) ?? s.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (!m) throw new BadRequestError("Enter a GitHub repository as owner/repo or https://github.com/owner/repo");
  return { owner: m[1], repo: m[2] };
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export function githubClient(token?: string, fetchImpl: FetchLike = fetch) {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "baton-handover-import",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return async function gh<T>(path: string): Promise<T> {
    const res = await fetchImpl(`https://api.github.com${path}`, { headers, cache: "no-store" });
    if (res.ok) return (await res.json()) as T;
    if ((res.status === 403 || res.status === 429) && res.headers.get("x-ratelimit-remaining") === "0") {
      throw new HttpError(429, token ? "GitHub rate limit reached. Try again in a few minutes." : "GitHub rate limit reached (60 requests/hour without a token). Set GITHUB_TOKEN or try later.");
    }
    if (res.status === 404) throw new HttpError(404, "Repository not found. It may be private or misspelled.");
    if (res.status === 401) throw new HttpError(502, "GITHUB_TOKEN was rejected by GitHub.");
    throw new HttpError(502, `GitHub returned ${res.status} for ${path}`);
  };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx], idx);
      }
    }),
  );
  return out;
}

type ApiIssue = GhIssue & { pull_request?: unknown; comments?: unknown };

export type GithubImport = { repo: string; sources: RawSource[]; counts: { commits: number; pulls: number; issues: number; readme: number } };

export async function importGithubRepo(
  url: string,
  opts: { token?: string; access?: Access; key: () => string; fetchImpl?: FetchLike },
): Promise<GithubImport> {
  const { owner, repo } = parseRepo(url);
  const full = `${owner}/${repo}`;
  const gh = githubClient(opts.token, opts.fetchImpl);
  const access = opts.access ?? "PUBLIC";
  const commentCap = opts.token ? COMMENT_FETCH_CAP_TOKEN : COMMENT_FETCH_CAP_NO_TOKEN;

  const meta = await gh<{ full_name: string; default_branch: string; private: boolean }>(`/repos/${full}`);
  const [commits, pulls, issuesRaw] = await Promise.all([
    gh<GhCommit[]>(`/repos/${full}/commits?per_page=${ITEM_CAP}`),
    gh<GhPull[]>(`/repos/${full}/pulls?state=all&sort=updated&direction=desc&per_page=${ITEM_CAP}`),
    gh<ApiIssue[]>(`/repos/${full}/issues?state=all&sort=updated&direction=desc&per_page=${ITEM_CAP}`),
  ]);
  const issues = issuesRaw.filter((i) => !i.pull_request).slice(0, ITEM_CAP);

  const prsWithComments = await mapLimit(pulls.slice(0, ITEM_CAP), 5, async (pr, idx) => {
    if (idx >= commentCap) return pr;
    const comments = await gh<NonNullable<GhPull["review_comments"]>>(`/repos/${full}/pulls/${pr.number}/comments?per_page=50`).catch(() => []);
    return { ...pr, review_comments: comments };
  });

  let fetched = 0;
  const issuesWithComments = await mapLimit(issues, 5, async (is) => {
    const n = typeof is.comments === "number" ? is.comments : 0;
    if (!n || fetched >= commentCap) return { ...is, comments: [] };
    fetched++;
    const comments = await gh<NonNullable<GhIssue["comments"]>>(`/repos/${full}/issues/${is.number}/comments?per_page=50`).catch(() => []);
    return { ...is, comments };
  });

  const readme = await gh<{ content: string; encoding: string; path: string; html_url?: string }>(`/repos/${full}/readme`).catch(() => null);

  const sources: RawSource[] = [];
  if (commits.length) sources.push({ ...commitsSource(opts.key(), meta.full_name, commits.slice(0, ITEM_CAP), access), title: `${meta.full_name} · commits on ${meta.default_branch}` });
  for (const pr of prsWithComments) sources.push(pullSource(opts.key(), pr, access));
  for (const is of issuesWithComments) sources.push(issueSource(opts.key(), is, access));
  if (readme?.content) {
    const text = Buffer.from(readme.content, (readme.encoding as BufferEncoding) || "base64").toString("utf8");
    sources.push(
      markdownSource(
        { key: opts.key(), title: readme.path || "README.md", uri: readme.html_url, access, authoritative: false, createdAt: new Date() },
        text,
      ),
    );
  }
  return {
    repo: meta.full_name,
    sources,
    counts: { commits: Math.min(commits.length, ITEM_CAP), pulls: prsWithComments.length, issues: issuesWithComments.length, readme: readme ? 1 : 0 },
  };
}
