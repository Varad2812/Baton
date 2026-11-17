# API

All responses are JSON: `{ "ok": true, ... }` or `{ "ok": false, "error": "<plain sentence>" }`.
Errors: 400 invalid input (with `issues[]`), 401 bad signature / admin token, 403 your persona may not do
this, 404 not found (also: someone else's project), 409 conflict / already in progress / stale version,
429 rate limited (`Retry-After`), 503 not configured.

**Who is calling.** Every browser has a signed visitor cookie (`baton_vid`, set by `src/proxy.ts`) and a
persona cookie (`baton_persona`: meera = Owner, rao = Reviewer, arjun = Successor, kabir = Observer).
`[slug]` resolves through `resolveProject`: `festflow` means *your* copy of the sample; a project created
by another visitor is 404. Permissions are checked on the server before any query or model call.

## Projects and demo

| Method | Route | Who | Notes |
|---|---|---|---|
| GET | `/api/health` | anyone | `{ ok, db, dbMs, version, uptimeS, llm, slack, github }`; always 200 |
| POST | `/api/projects` | anyone (becomes Owner) | `{ name, description? }` → `{ project, handoverId }` (private to your browser) |
| DELETE | `/api/projects/[slug]` | Owner, same browser that created it | Cascades every row; templates and demo copies cannot be deleted |
| POST | `/api/demo/reset` | anyone | Resets only your copy of the sample; 20 per minute per visitor |
| GET | `/api/cron/cleanup` | `Authorization: Bearer $ADMIN_TOKEN` | Deletes expired sandboxes and idle visitor projects |

## Sources and pipeline

| Method | Route | Who | Notes |
|---|---|---|---|
| POST | `/api/projects/[slug]/sources` | Owner | multipart `files[]` (.md .txt .csv .json .docx .pdf, Slack export .zip; 5 MB each, 10 files), `access`, `authoritative`. Same file twice adds nothing |
| POST | `/api/projects/[slug]/sources/github` | Owner | `{ url, access? }`. Re-import appends only new items; stores a sync cursor |
| POST | `/api/projects/[slug]/sources/slack-export` | Owner | multipart `file` (official Slack export ZIP, 25 MB) |
| PATCH | `/api/projects/[slug]/sources/[sourceId]` | Owner | `{ access?, authoritative?, grantedToIncoming? }`; chunks inherit, facts re-graded |
| GET | `/api/projects/[slug]/connectors/slack/channels?ref=demo\|conn:<id>` | Owner | Channels with visibility, members, whether Baton is in them |
| POST | `/api/projects/[slug]/connectors/slack/import` | Owner | `{ ref, channels: [{ id, access? }] }` (≤ 20) |
| POST | `/api/projects/[slug]/pipeline` | Owner | `{ mode?: LIVE\|CACHED, budget?, runId? }` → SSE `data: {stage,status,counts,ms}`; 409 while another run or sync holds the lock |
| GET | `/api/projects/[slug]/pipeline` | any persona | Latest run (stages written as they finish) and default mode |

Server actions (forms on the Sources page, same rules): **Sync now** (`syncNow`: GitHub delta + Slack
re-sync), **Simulate new activity** (`simulateNewActivity`, sample project only), uploads, labels, grants.

## Facts, conflicts, interview

| Method | Route | Who | Notes |
|---|---|---|---|
| PATCH | `/api/projects/[slug]/claims/[claimId]` | Owner, Reviewer | `{ title?, statement?, section?, reviewerNote? }` |
| POST | `/api/projects/[slug]/claims/[claimId]/reject` | Owner, Reviewer | `{ note?, undo? }` |
| POST | `/api/projects/[slug]/conflicts/[conflictId]/resolve` | Owner, Reviewer | `{ resolution: A\|B\|BOTH\|ASKED, note? }`; concurrent duplicates get 409 |
| POST | `/api/projects/[slug]/gap-questions/[questionId]/answer` | Owner | `{ answer (10-4000 chars), assisted? }` → testimony; a second answer is 409 |

## Handover

| Method | Route | Who | Notes |
|---|---|---|---|
| POST | `/api/projects/[slug]/handover/approve` | Reviewer (never the departing owner) | `{ note?, override?, expectedVersion? }`; blockers need override + note; a stale or repeated request is 409 |
| GET | `/api/projects/[slug]/handover?version=n` | any persona | Your role's stored view of version n |
| GET | `/api/projects/[slug]/handover/preview` | any persona | Live draft view for your role |
| GET | `/api/projects/[slug]/handover/export?format=md\|json` | any persona | Your role's view with numbered citations, quotes and source links |
| POST | `/api/projects/[slug]/handover/ack` | Successor | `{ version, section }` (idempotent) |
| POST | `/api/projects/[slug]/followups` | Successor | `{ claimId? \| section?, question }`; same open question twice returns the first |
| POST | `/api/projects/[slug]/followups/[followUpId]/answer` | Owner | `{ answer, assisted? }` → testimony |
| POST | `/api/projects/[slug]/access-requests` | Successor | `{ section?, reason }` (audit only) |
| GET | `/share/[token]` (page) | anyone with the link | Signed, read-only successor view of an approved version; 7 days |

## Q&A and help

| Method | Route | Who | Notes |
|---|---|---|---|
| POST | `/api/projects/[slug]/ask` | any persona | `{ question (3-500) }` → `{ answer: { status, text, sentences[{text, cites[]}], sources[], mode, engine, stats } }`. 20/10 min per IP with models, then offline; 60 hard limit |
| POST | `/api/projects/[slug]/ask/owner` | Successor | `{ question }` → follow-up for the departing owner (deduplicated) |
| POST | `/api/assistant` | anyone | Ask Baton: `{ slug?, page, message, history[] }` (how to use Baton) |
| POST | `/api/assistant/draft` | depends on field | Draft text for one form field; testimony fields only rephrase your notes |

## Trust

| Method | Route | Who | Notes |
|---|---|---|---|
| GET | `/api/projects/[slug]/trust` | any persona | Quote validity, grades, redactions, accuracy (sample), leakage, runs, audit (meta only for Owner/Reviewer) |
| POST | `/api/projects/[slug]/trust/leakage` | any persona | Recompile every role and scan for canaries; audit row |
| POST | `/api/projects/[slug]/trust/recheck-quotes` | Owner, Reviewer | Re-match every stored quote; re-grade |

## Integrations

| Method | Route | Auth | Notes |
|---|---|---|---|
| POST | `/api/webhooks/github` | `X-Hub-Signature-256` with `GITHUB_WEBHOOK_SECRET` (503 if unset) | push / PR / issue events → incremental sync of every project that imported the repo; 202 |
| GET | `/api/connectors/slack/start?slug=` | Owner | Redirects to Slack consent with signed `state` + nonce cookie |
| GET | `/api/connectors/slack/callback` | Slack redirect | Checks state, nonce, visitor, expiry; stores the bot token encrypted |
| POST | `/api/connectors/slack/events` | Slack v0 signature (`SLACK_SIGNING_SECRET`) | URL verification; uninstall / token revoked → connection revoked |
