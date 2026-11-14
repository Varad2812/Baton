# Progress

## Done

### Phase 0: skeleton
- Next.js 16 (App Router, TS strict, src/), Tailwind v4 wired to Baton tokens, shadcn/ui base (Button) restyled
- Fonts via next/font: Source Serif 4 (titles), Inter (UI), JetBrains Mono (numbers/quotes)
- Prisma 7 + PostgreSQL (driver adapter `@prisma/adapter-pg`), `GET /api/health` -> `{ ok, db }`
- `render.yaml` Blueprint, `.env.example`, README stub

### Phase 1: data layer + FestFlow dataset
- **Schema**: full domain model from CLAUDE.md (`prisma/schema.prisma`), migration
  `20260102000000_domain_model`, applied to the Render DB. Cascades from Project through every
  child chain; indexes on projectId / claimId / chunkId / sourceId / versionId / handoverId.
  Small additions beyond CLAUDE.md: `Redaction.mentionedBy`, `RunStatus` enum,
  `FollowUp.createdAt`, nullable `HandoverVersion.approvedById/approvedAt`.
- **Authz** (`src/lib/authz.ts`): personas + `baton_persona` cookie (`getActor()`, default Meera),
  `can(role, action)`, `assertCan` / `ForbiddenError`, `accessLevelsFor`, `allowedAccess(role, projectId)`
  (INCOMING gets granted RESTRICTED sources), `canSeeChunk` / `canSeeClaim`, `writeAudit`.
  `npm test` (vitest): 59 tests over the full permission matrix and access rules.
- **Fixtures** (`seed/`): 60 commits (23 email-templates, all Meera), 12 PRs with review comments,
  15 issues, 153 Discord messages (#general, #dev, #payments), 5 docs (README, architecture,
  3 meeting notes), 26-card Trello CSV, RESTRICTED budget sheet (canary `CANARY-RM-7F3A` + sponsor phone).
  All story beats present; "Build fails on Windows" appears exactly 7 times; fake secret `ffk_live_…`.
- **Pipeline building blocks** (reused by Phase 2): `src/lib/pipeline/adapters.ts` (GitHub, markdown,
  Discord, Trello, CSV), `normalise.ts` (chunker ~800 chars with locators, identity map, redaction),
  `quotes.ts` (`normaliseForMatch`, `findQuote`).
- **Cache**: `seed/cache-src/claims.ts` (hand-authored claims, conflicts, gap questions, testimony, audit)
  -> `npm run seed:build-cache` -> `seed/pipeline-cache.json`. `npm run seed:verify` independently checks
  quotes (exact substring + offsets), grade rules, access, redaction/canary hygiene, coverage and ground truth.
- **Ground truth** (`seed/ground-truth.json`): 12 decisions, 8 risks, 3 conflicts, 3 supersessions,
  7 gaps, 4 recurring, 1 single-owner area, canary, redactions, identity map.
- **Seeding**: `src/lib/seed/festflow.ts` (`seedFestflow`, `resetFestflow`, `festflowCounts`);
  `prisma db seed` (idempotent; `tsx prisma/seed.ts --reset` to reload); `db:ensure-seed` seeds an empty DB
  and also repairs a FestFlow row with no claims. `POST /api/demo/reset`: no auth, 1 per 10s (429 +
  Retry-After), atomic wipe+reseed of FestFlow only, writes a `demo.reset` audit row.

### Seeded counts (Render DB, verified via /api/demo/reset)
| Item | Count |
|---|---|
| Sources | 40 (38 fixtures + 2 testimony) |
| Chunks | 122 |
| Redactions | 4 (1 SECRET, 2 EMAIL, 1 PHONE) |
| Claims | 67 |
| by grade | VERIFIED 32 · SINGLE_SOURCE 17 · INFERRED 6 · CONFLICTING 6 · MISSING 6 |
| by type | DECISION 20 · RISK 12 · TASK 9 · DEPENDENCY 9 · CONTACT 8 · RECURRING 5 · QUESTION 4 |
| by access | TEAM 55 · PUBLIC 10 · RESTRICTED 2 |
| Evidence quotes | 127 (100% exact substrings) |
| Conflicts | 3 open CONTRADICTS (payment gateway, registration close, refund cutoff) + 3 SUPERSEDES |
| Gap questions | 10 (2 answered with testimony, 8 open incl. prod DB password + sponsor contact) |
| Handover | Meera -> Arjun, reviewer Prof. Rao, IN_REVIEW, no versions yet |
| Audit log | 12 seeded rows (+1 per reset) |
| Pipeline run | 1 CACHED, SUCCEEDED, 8 stages with counts/ms |

### Phase 2: pipeline, LLM client, server functions (branch `pipeline`)
- **`src/lib/llm.ts`**: `llmJson({name, system, prompt, schema})` over the `@google/genai` **Interactions API**
  (`interactions.create` + `response_format: {type:"text", mime_type:"application/json", schema}`), with a
  `models.generateContent` + `responseJsonSchema` fallback if Interactions rejects the request. The schema is zod →
  `z.toJSONSchema`, and every response is zod-validated (one repair attempt). LlmCache key = sha256(model+system+prompt+schema),
  checked **before** the key, so cached answers work with no key. Retries 429/5xx/network with backoff (max 3), global
  concurrency 2, per-run budget (default 40, counted at dispatch). **Any provider failure → `LlmUnavailableError`**
  (incl. `LlmBudgetError`), and a rejected key stops further calls in that run. Pluggable cache: `dbCache` / `fileCache` / `memoryCache`.
- **Stages** (`src/lib/pipeline/`, each pure + thin LLM wrapper): `extract.ts` (batches ≤4k chars by source family;
  RESTRICTED never mixed; testimony excluded), `validate.ts` (exact quote match, drop invalid, discard non-inference
  claims without evidence, topic canonicalisation + duplicate merge), `grade.ts`, `conflicts.ts` (pairs by topicKey,
  A older; CONTRADICTS/SUPERSEDES/CONSISTENT), `gaps.ts` (12-item checklist, single-owner from commit history,
  specific gaps via LLM), `questions.ts` (priority = risk weight × dependents, ≤10, LLM rewords only), `score.ts`
  (vs ground truth), `stages.ts` (`runStages`, DB-free), `run.ts` (`runPipeline`, SSE events, cache fallback,
  one transaction), `preserve.ts` (re-run safety), `store.ts` (load/persist/regrade), `testimony.ts`, `sources.ts`,
  `ingest/files.ts` (.md .txt .csv Trello/sheet, Discord multi/single-channel, Slack array/{messages}, .docx),
  `ingest/github.ts` (commits, PRs + review comments, issues + comments, README; cap 100/type; GITHUB_TOKEN optional).
- **Role compilation** (`src/lib/handover/compile.ts`): visible = every evidence chunk allowed; writer gets only visible
  claims; the scan checks canaries (`CANARY-…`) in hidden chunks and quotes of hidden claims, ignoring any string that also
  appears in material the role can see. Any hit throws away the model text and uses the leak-free template.
- Single-owner detection ignores repo-wide scaffold commits (≥4 areas), so email-templates is Meera 23/23 as in the story.
- `npm test`: **145 tests** (authz 59, llm 11, grade, conflicts, gaps, questions, preserve, validate/batching,
  normalise/quotes/redaction, ingest incl. GitHub with a fake fetch, testimony, score, compile incl. "INCOMING/OBSERVER
  never see CANARY-RM-7F3A", even with an echoing or adversarial writer).

### Metrics (2026-11-14)
- **Live Gemini run (2026-11-15): NOT COMPLETED, free-tier quota.** The new key in `.env` works (a test call answered),
  but it is on the Gemini **free tier (20 requests/day)**. Two runs died on the 60 s timeout (see below), and the third hit
  `429 ... limit: 20 requests per day`, retry after about 12h38m. 8 of the 18 extract answers are saved in `seed/.llm-cache/`
  (gitignored), so the next run needs about 10 more extract calls plus 4-5 for the later stages. Rerun
  `env -u GEMINI_API_KEY npm run seed:pipeline` once the quota resets (or on a paid key). It writes
  `seed/pipeline-metrics.json` and replaces the cache only if live is at least as good.
- **Model:** default is now `gemini-3.5-flash` (llm.ts, build-cache, .env, .env.example, render.yaml, CLAUDE.md). On
  2026-11-15 `gemini-3.8-flash` took 406 s for a 2-word answer and hit a 90 s cap on three more tiny calls; 3.7-flash took 23 s and 3.5-flash 5 s.
- **60 s per-call timeout** (`CALL_TIMEOUT_MS`): a slower call is `LlmTimeoutError` (an `LlmUnavailableError`), is not
  retried, and fails the rest of the run fast, so FestFlow finishes from the cache. Measured on 3.5-flash: one 7.4k-char
  extract batch took 36 s on generateContent and 53 s on Interactions, so batches are now capped at **4,000 chars**
  (18 extract calls for FestFlow), and topic canonicalisation returns only the claims it changes.
- Current cache vs ground truth (`scoreAgainstTruth`): decisions 12/12, risks 8/8, conflicts 3/3, supersessions 3/3,
  gaps 7/7, recurring 4/4 → **recall 100%, precision 100%**, decision grades 12/12, stored quotes 127/127 exact, canary
  in claims 0. (Hand-authored, so it scores 100% by construction; a live run replaces it only if it does at least as well
  and `seed:verify` passes.)
- E2E against the Render DB (local prod build, then demo reset): leakage test **0 hits for all 4 roles** (draft, writer
  input and stored v1/v2 views); recheck 129/129 valid; new project: upload + GitHub import (`octocat/git-consortium`:
  61 sources, 83 chunks) with secrets/emails redacted before storage.

### Server API for the UI (all JSON `{ok:true,...}` / `{ok:false,error}`; persona from cookie `baton_persona`)
Errors: 400 invalid input (`issues[]`), 403 `FORBIDDEN`, 404, 409 conflict/busy, 429 rate limit, 503 model/cache unavailable.
Functions live in `src/lib/pipeline/{run,sources,testimony,trust}.ts` and `src/lib/handover/service.ts`; each takes
`(actor, projectId, ...)`, so Server Actions can call them directly with `await getActor()`.

| Route | Function | Who |
|---|---|---|
| `POST /api/projects` `{name, description?}` | `createProject` | Owner |
| `POST /api/projects/[slug]/pipeline` `{mode?: LIVE\|CACHED, budget?}` → **SSE** `data: {stage,status,counts,ms,message}`; last event `stage:"done"` (with `runId`, `mode`, totals) or `"error"` | `runPipeline` | Owner |
| `GET /api/projects/[slug]/pipeline` → `{run, defaultMode}` | | any |
| `POST /api/projects/[slug]/sources` multipart `files[]`, `access`, `authoritative` | `uploadSources` | Owner |
| `POST /api/projects/[slug]/sources/github` `{url, access?}` | `importGithub` | Owner |
| `PATCH /api/projects/[slug]/sources/[sourceId]` `{access?, authoritative?, grantedToIncoming?}` | `labelSource` (grant = per-source INCOMING access) | Owner |
| `POST /api/projects/[slug]/gap-questions/[questionId]/answer` `{answer}` | `answerGapQuestion` | Owner |
| `PATCH /api/projects/[slug]/claims/[claimId]` `{title?, statement?, section?, reviewerNote?}` | `editClaim` | Owner, Reviewer |
| `POST /api/projects/[slug]/claims/[claimId]/reject` `{note?, undo?}` | `rejectClaim` | Owner, Reviewer |
| `POST /api/projects/[slug]/conflicts/[conflictId]/resolve` `{resolution: A\|B\|BOTH\|ASKED, note?}` | `resolveConflict` (A/B rejects the other claim; ASKED queues a question) | Owner, Reviewer |
| `POST /api/projects/[slug]/handover/approve` `{note?}` → `{version, views[]}` | `approveVersion` | Reviewer |
| `GET /api/projects/[slug]/handover?version=n` → `{version, view:{compiled,hiddenCount}, acknowledgements}` | `getRoleView` (viewer's own role) | any |
| `GET /api/projects/[slug]/handover/preview` | `previewRoleView` (draft, template writer) | any |
| `POST /api/projects/[slug]/handover/ack` `{version, section}` | `acknowledgeSection` | Incoming |
| `POST /api/projects/[slug]/followups` `{claimId?, section?, question}` | `createFollowUp` | Incoming |
| `POST /api/projects/[slug]/followups/[followUpId]/answer` `{answer}` | `answerFollowUp` | Owner |
| `POST /api/projects/[slug]/access-requests` `{section?, reason}` | `requestAccess` (audit `access.requested`) | Incoming |
| `GET /api/projects/[slug]/trust` | `trustReport` (audit meta only for Owner/Reviewer) | any |
| `POST /api/projects/[slug]/trust/leakage` | `runLeakageTest` | any |
| `POST /api/projects/[slug]/trust/recheck-quotes` | `recheckQuotes` | Owner, Reviewer |

`compiled` (RoleView) = `{role, overview, sections[{section, items[claim+evidence], hidden}], plan7[{text, claimIds}],
plan30, openConflicts[{id, a, b}], hiddenCount, writer: model|template, canary:{checked, hits, fallback}}`.
Section acks accept a section name, `Overview`, `7-day plan` or `30-day plan`.

## Next
1. After the Gemini quota resets: `env -u GEMINI_API_KEY npm run seed:pipeline`, commit `seed/pipeline-metrics.json`
   (and the cache only if replaced). Set the key + `GEMINI_MODEL` on Render.
2. UI (branch `ui`): app shell + "Viewing as" switcher, dashboard, sources stepper (consume the SSE), ledger, conflicts,
   interview, review/approve, handover, trust, all using the routes above.
3. Merge `pipeline` → `main` once the UI branch is ready; check `/api/demo/reset` restores everything (it does today).

## Known issues
- **Stale shell variable:** an old 19-char `GEMINI_API_KEY` is exported in the local shell, and dotenv never overrides
  existing variables, so local scripts use the stale key unless run with `env -u GEMINI_API_KEY ...`. Remove it from
  your shell profile. Also set the new key and `GEMINI_MODEL=gemini-3.5-flash` in the Render dashboard (render.yaml has the model).
- **Free-tier key:** 20 requests/day, and one FestFlow LIVE run needs about 23 calls (18 extract + canonicalise + conflicts +
  gaps + questions), so a full live run cannot finish on one day's quota. In-app LIVE runs will mostly fall back to the
  cache (mode CACHED with a notice). Answers already in LlmCache are free.
- Without a working model, LIVE runs on FestFlow fall back to the cache (mode CACHED, with a notice on the run) and LIVE
  runs on new projects fail with "Nothing was changed".
- `approveVersion` allows approving while conflicts are open; they show as CONFLICTING in the views and in `openConflicts`.
  The UI should warn before approving.
- Testimony fallback (no model): conflict settlement uses a token heuristic on the answer's first sentence; unclear answers
  leave the conflict OPEN with resolution `ASKED`.
- Trust `accuracy` scores the *current* ledger. Reviewer rejections (e.g. resolving a conflict A/B) lower conflict recall until reset.
- `next dev` here did not hot-reload API route changes during testing; restart the dev server after editing `src/lib`.
- `pg` prints an SSL-mode deprecation warning for `sslmode=require` (treated as verify-full today;
  works). Switch the URL to `sslmode=verify-full` to silence it if it gets noisy.
- `/api/demo/reset` takes ~5s from a laptop to Render Singapore (one transaction, createMany); should be
  faster from the Render web service. The rate limit is per server instance (fine for one free instance).
- Seeded claim ids are fixed strings (`clm_*`, `chk_*`, `src_*`); new projects use cuids.
- Prisma 7: generated client lives in `src/generated/prisma` (gitignored, created by `postinstall`).
- Local `.env` had the Render URL pasted in front of the key on line 1; fixed in place (backup in
  `.env.bak`, gitignored, safe to delete).
