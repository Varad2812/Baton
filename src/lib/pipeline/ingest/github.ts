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
  const s = input
    .trim()
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "")
    .replace(/^git@github\.com:/i, "github.com/");
  const m =
    s.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)(?:\/.*)?$/i) ?? s.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (!m) throw new BadRequestError("Enter a GitHub repository as owner/repo or https://github.com/owner/repo");
  const repo = m[2].replace(/\.git$/i, "");
  if (!repo || repo === "." || repo === "..") throw new BadRequestError("Enter a GitHub repository as owner/repo or https://github.com/owner/repo");
  return { owner: m[1], repo };
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** Map a non-OK GitHub response to a user-facing error. `usedToken` picks the rate-limit wording. */
export function mapGithubError(status: number, rateRemaining: string | null, path: string, usedToken: boolean): HttpError {
  if ((status === 403 || status === 429) && rateRemaining === "0") {
    return new HttpError(
      429,
      usedToken ? "GitHub rate limit reached. Try again in a few minutes." : "GitHub rate limit reached (60 requests/hour without a token). Set GITHUB_TOKEN or try later.",
    );
  }
  if (status === 401) return new HttpError(502, "GitHub token is invalid or expired.");
  if (status === 404) return new HttpError(404, "Repository not found. It may be private or misspelled.");
  if (status === 410) return new HttpError(404, "This part of the repository is disabled on GitHub.");
  return new HttpError(502, `GitHub returned ${status} for ${path}`);
}

export function githubClient(token?: string, fetchImpl: FetchLike = fetch) {
  const base: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "baton-handover-import",
  };
  let activeToken = token?.trim() || undefined;
  const get = (path: string) =>
    fetchImpl(`https://api.github.com${path}`, {
      headers: activeToken ? { ...base, Authorization: `Bearer ${activeToken}` } : base,
      cache: "no-store",
    });
  return async function gh<T>(path: string): Promise<T> {
    let res = await get(path);
    // A bad token must never block public repos: on 401/403 (not rate limit) retry once anonymously.
    if (activeToken && (res.status === 401 || (res.status === 403 && res.headers.get("x-ratelimit-remaining") !== "0"))) {
      activeToken = undefined;
      res = await get(path);
    }
    if (res.ok) return (await res.json()) as T;
    throw mapGithubError(res.status, res.headers.get("x-ratelimit-remaining"), path, !!activeToken);
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

export type GithubCursor = { lastCommitDate: string | null; issuesSince: string; pullsSince: string; etag?: string | null };
export type GithubImport = { repo: string; cursor: GithubCursor; sources: RawSource[]; counts: { commits: number; pulls: number; issues: number; readme: number } };

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
  // The repo itself exists (meta succeeded), so a 404/410 on a sub-resource means that feature is
  // disabled or empty (e.g. pull requests turned off, issues disabled, empty repo): treat as none.
  const optional = <T,>(p: Promise<T[]>): Promise<T[]> =>
    p.catch((e) => {
      if (e instanceof HttpError && (e.status === 404 || e.status === 409)) return [];
      throw e;
    });
  const [commits, pulls, issuesRaw] = await Promise.all([
    optional(gh<GhCommit[]>(`/repos/${full}/commits?per_page=${ITEM_CAP}`)),
    optional(gh<GhPull[]>(`/repos/${full}/pulls?state=all&sort=updated&direction=desc&per_page=${ITEM_CAP}`)),
    optional(gh<ApiIssue[]>(`/repos/${full}/issues?state=all&sort=updated&direction=desc&per_page=${ITEM_CAP}`)),
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
  if (commits.length) sources.push({ ...commitsSource(opts.key(), meta.full_name, commits.slice(0, ITEM_CAP), access), title: `${meta.full_name} · commits on ${meta.default_branch}`, externalId: `gh:${meta.full_name}:commits` });
  for (const pr of prsWithComments) sources.push({ ...pullSource(opts.key(), pr, access), externalId: `gh:${meta.full_name}:pr:${pr.number}` });
  for (const is of issuesWithComments) sources.push({ ...issueSource(opts.key(), is, access), externalId: `gh:${meta.full_name}:issue:${is.number}` });
  if (readme?.content) {
    const text = Buffer.from(readme.content, (readme.encoding as BufferEncoding) || "base64").toString("utf8");
    sources.push({
      ...markdownSource(
        { key: opts.key(), title: readme.path || "README.md", uri: readme.html_url, access, authoritative: false, createdAt: new Date() },
        text,
      ),
      externalId: `gh:${meta.full_name}:readme`,
    });
  }
  const newest = commits.map((c) => c.commit.author.date).sort().at(-1) ?? null;
  return {
    cursor: { lastCommitDate: newest, issuesSince: new Date().toISOString(), pullsSince: new Date().toISOString() },
    repo: meta.full_name,
    sources,
    counts: { commits: Math.min(commits.length, ITEM_CAP), pulls: prsWithComments.length, issues: issuesWithComments.length, readme: readme ? 1 : 0 },
  };
}

/**
 * Incremental fetch since `cursor`: commits after lastCommitDate (conditional request with the stored
 * ETag; 304 = nothing new, costs no rate limit), and PRs / issues updated since the last sync with their
 * comments. Returns raw sources with the same externalIds as the first import, so the ingest appends to
 * them and skips items already seen.
 */
export async function fetchGithubDelta(
  repoFull: string,
  cursor: GithubCursor,
  opts: { token?: string; access?: Access; key: () => string; fetchImpl?: FetchLike },
): Promise<{ sources: RawSource[]; cursor: GithubCursor; counts: { commits: number; pulls: number; issues: number }; notModified: boolean }> {
  const { owner, repo } = parseRepo(repoFull);
  const full = `${owner}/${repo}`;
  const f = opts.fetchImpl ?? fetch;
  const token = opts.token?.trim() || undefined;
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "baton-handover-import" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const access = opts.access ?? "PUBLIC";

  const since = cursor.lastCommitDate ? `&since=${encodeURIComponent(new Date(new Date(cursor.lastCommitDate).getTime() + 1000).toISOString())}` : "";
  const res = await f(`https://api.github.com/repos/${full}/commits?per_page=${ITEM_CAP}${since}`, {
    headers: cursor.etag ? { ...headers, "If-None-Match": cursor.etag } : headers,
    cache: "no-store",
  });
  let commits: GhCommit[] = [];
  let etag = cursor.etag ?? null;
  const notModified = res.status === 304;
  if (!notModified) {
    if (!res.ok && res.status !== 409) throw mapGithubError(res.status, res.headers.get("x-ratelimit-remaining"), "/commits", !!token);
    commits = res.ok ? ((await res.json()) as GhCommit[]) : [];
    etag = res.headers.get("etag");
  }
  const gh = githubClient(token, f);
  const optional = <T,>(p: Promise<T[]>): Promise<T[]> => p.catch((e) => (e instanceof HttpError && (e.status === 404 || e.status === 409) ? [] : Promise.reject(e)));
  const [pullsAll, issuesRaw] = await Promise.all([
    optional(gh<(GhPull & { updated_at?: string })[]>(`/repos/${full}/pulls?state=all&sort=updated&direction=desc&per_page=50`)),
    optional(gh<(ApiIssue & { updated_at?: string })[]>(`/repos/${full}/issues?state=all&sort=updated&direction=desc&per_page=50&since=${encodeURIComponent(cursor.issuesSince)}`)),
  ]);
  const pulls = pullsAll.filter((p) => (p.updated_at ?? p.created_at) > cursor.pullsSince);
  const issues = issuesRaw.filter((i) => !i.pull_request);
  const prs = await mapLimit(pulls, 4, async (pr) => ({
    ...pr,
    review_comments: await gh<NonNullable<GhPull["review_comments"]>>(`/repos/${full}/pulls/${pr.number}/comments?per_page=50`).catch(() => []),
  }));
  const iss = await mapLimit(issues, 4, async (is) => ({
    ...is,
    comments: typeof is.comments === "number" && is.comments ? await gh<NonNullable<GhIssue["comments"]>>(`/repos/${full}/issues/${is.number}/comments?per_page=50`).catch(() => []) : [],
  }));

  const sources: RawSource[] = [];
  if (commits.length) sources.push({ ...commitsSource(opts.key(), full, commits, access), externalId: `gh:${full}:commits` });
  for (const pr of prs) sources.push({ ...pullSource(opts.key(), pr, access), externalId: `gh:${full}:pr:${pr.number}` });
  for (const is of iss) sources.push({ ...issueSource(opts.key(), is, access), externalId: `gh:${full}:issue:${is.number}` });
  const now = new Date().toISOString();
  const newest = [cursor.lastCommitDate, ...commits.map((c) => c.commit.author.date)].filter((d): d is string => !!d).sort().at(-1) ?? null;
  return {
    sources,
    cursor: { lastCommitDate: newest, issuesSince: now, pullsSince: now, etag },
    counts: { commits: commits.length, pulls: prs.length, issues: iss.length },
    notModified,
  };
}
