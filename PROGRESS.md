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
| `POST /api/projects/[slug]/handover/approve` `{note?, override?}` → `{version, views[]}` (409 while blocked without override + note) | `approveVersion` | Reviewer |
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

### Phase 3 (branch `ui`): product UI on seeded data
- **Design system** (`src/components/ui`): Button, Badge, GradeChip/GradeDot, AccessChip, Card(+Header/Body/Footer),
  Stat, Sparkline, DataTable (sortable, sticky header, fixed layout, `optional` columns hide < 1400px), Tabs,
  Drawer, Dialog, Tooltip, Toast (`useActionToast`), Skeleton, EmptyState, Kbd, Avatar (initials + hash colour),
  SegmentedControl, Timeline. Hidden `/styleguide` (noindex) shows all of them.
- **Data layer for views** (`src/lib/views/*`, read-only Prisma): `claims.ts` (`loadClaims` = persona filter via
  `allowedAccess` + `canSeeClaim`; hidden claims never leave the server, only counts), `project.ts` (shell counts,
  stepper stage), `dashboard.ts` (grades, readiness formula, bus factor parsed from commit chunks, timeline,
  needs-attention), `checklist.ts` (12-item checklist), `handover.ts` (deterministic role-compiled draft + 7/30-day
  plan), `trust.ts` (quote validity, accuracy vs `seed/ground-truth.json`, canary leakage per role), `format.ts`
  (labels, `citationLabel` e.g. "PR #84", "notes 14-Mar", "#payments 19-Apr" from the quoted message).
- **Shell** `/p/[slug]/layout.tsx`: sidebar with live count badges, breadcrumb, `/` search -> ledger, "Viewing as"
  menu (real action `src/app/_actions/persona.ts` sets `baton_persona` + `refresh()`), Reset demo dialog (POST
  `/api/demo/reset`, 429 message), stage stepper Connect -> Reconstruct -> Verify -> Review -> Handover.
- **Pages**: dashboard, sources, ledger (+ `?claim=` drawer with highlighted quotes, side-by-side contradictions,
  full-chunk "Open source"), conflicts, interview (Web Speech dictation), review (gates, checklist, approve dialog,
  no self-approval), handover (+ `/handover/receipt`, print CSS, sha256), trust. Loading skeletons per route,
  `error.tsx`, `not-found.tsx`. Landing has an "Open live demo" link only (full landing/3D still to do).
- Verified: typecheck, lint, build, 59 tests; Playwright screenshots of every page at 1440x900 for all 4 personas
  and 1280px (no horizontal overflow); persona switch, drawer, search, reset dialog, action toast tested.

### Phase 3b (branch `ui`): landing page + 3D
- **Landing `/`** (`src/app/page.tsx`, ISR `revalidate = 60`): serif "Baton" headline, tagline, pitch, "Open live
  demo" → `/p/festflow`, "Start your own handover" → `/new` (route not built yet: 404 until the wizard lands),
  "60-second tour" → `/p/festflow?tour=1` (the `tour` param is not handled yet), 3 USP rows, HeroStack scene,
  live stats row, "How it works" (staircase + 5 steps with live counts), footer "[Team Name] · VIT Pune".
- **Live numbers**: `src/components/landing/stats.ts` `getLandingStats()` reads FestFlow via `@/lib/db` (sources by
  kind, claims by grade excl. REJECTED, quotes matched, conflicts/supersessions, gap questions, redactions, last
  run, handover status) and runs a canary scan for Observer (Public) and Successor-without-grants (Public+Team).
  Returns null if the DB is down: stats show "—", the page still renders.
- Only the hero CTA prefetches; other links use `prefetch={false}` (slow RSC prefetches of the dynamic `/p/*` pages
  were holding all 6 connections and delaying the three.js chunks ~2.8s).
- Verified (prod build, local): Lighthouse desktop on `/` performance 100, accessibility 100, best practices 100
  (TBT 0–50ms, LCP 0.2s, CLS 0); Playwright screenshots at 1440x900, 390px (no horizontal overflow), and
  reduced motion (static frame, every cube settled).

### Phase 4 (branch `pipeline`, after merging `ui`): product works end to end
- **Server actions** (`src/app/_actions/*`, except `new-project.ts`) call the real lib functions: zod input →
  `actionContext(slug, action)` (`src/lib/server/action-context.ts`: `getActor` + `assertCan` + project) → service/pipeline
  function (writes `AuditLog`) → `refresh()` → `ActionResult {ok, message, data?}` shown as a toast. `pendingResult` is gone.
  `runPipeline` has no action: the Sources page streams the SSE route instead. New: `trust.ts`, `review.markSectionReviewed`.
- **Offline switch:** `LLM_DISABLED=1` makes `hasGeminiKey()` false, so every call is cache → fallback. Used for e2e and
  manual checks while the free-tier quota is spent.
- **Sources:** "Run pipeline" streams `POST /api/projects/[slug]/pipeline` into `LazyPipelineStaircase` (8 stages → 5 phases)
  plus a live stage log with counts/ms; neutral note when the run used the cache; inline error + Retry. Owner gets an access
  `<select>` per source (`labelSource`, chunks inherit, claims re-graded) and the per-source grant to Arjun. Uploads send
  real files (FormData; `serverActions.bodySizeLimit` 21 MB).
- **Dashboard:** `LazyEvidenceConstellation` from persona-filtered nodes/edges (`buildConstellation` in `views/dashboard.ts`;
  hidden claims only as a count). Clicking a claim opens the shared `EvidenceDrawer` (`components/ledger/evidence-drawer.tsx`,
  also used by the ledger) via `?claim=`. The shell stepper stays (a 132px staircase does not fit the top bar).
- **Conflicts:** Pick A / Pick B / Both valid / Ask Meera call `resolveConflict` (loser rejected, both re-graded, ASKED queues
  a question with a link). Resolved list shows the kept claim, who and when.
- **Interview:** answers become testimony and show `Missing → Single source` inline (from `gradeBefore`/`gradeAfter` in the
  `interview.answer` audit meta). P1/P2/P3 chips (`priorityTier`, P1 ≥ 40). Follow-up inbox: Meera answers there;
  `answerFollowUp` now writes testimony through the same `writeTestimony` helper as the interview (claim-level: extra
  SUPPORTS quote + re-grade; section-level: new single-source testimony claim).
- **Review:** `src/lib/handover/gates.ts` is the one approval gate (open CONTRADICTS conflicts + unanswered P1 questions;
  a CONFLICT question counts as settled once its conflict is resolved). `approveVersion` enforces it on the server; override
  needs a 10+ char note, stored in `snapshot.approval`, `version.note` and the audit meta. Inline title/statement/note editor,
  reject with reason + Restore, per-section "Mark reviewed" (audit rows `section.reviewed`, reset by each approval), version
  history with `?diff=1..draft` / `?diff=1..2` (`diffSnapshots`, filtered to the viewer's access in `versionDiff`).
- **Handover:** `views/handover.ts` `getHandoverPage` renders the stored RoleView of the latest version for the viewer's role,
  else the live draft preview (same `compileView`, labelled "Draft preview · not yet approved"). Ack per section incl.
  Overview and 7/30-day plans, follow-ups, "N claims hidden — Request access" (audit `access.requested`, shows "Requested").
  Receipt lists real acknowledgement timestamps and the override note/blockers.
- **One implementation each:** trust = `pipeline/trust.ts` `trustReport` (+ `leakageReport` extracted from
  `runLeakageTest`; accuracy = `scoreAgainstTruth`); `views/trust.ts` and the old draft compiler in `views/handover.ts`
  deleted; checklist labels from `pipeline/checklist.ts`; commit parsing in `pipeline/commits.ts` (single-owner gap and
  dashboard bus factor agree: email-templates Meera 23/23). Trust page has "Re-check quotes" and "Run leakage test".
- **Tests:** `npm test` 156 (new: gates, diff, commits). **`npm run e2e`** (Playwright, `e2e/handover.spec.ts`, builds and
  starts `next start -p 3100` with `LLM_DISABLED=1`; `E2E_SKIP_BUILD=1` reuses `.next`): Meera answers 2 gap questions →
  Prof. Rao picks Razorpay, approval is blocked, override + note → v1 → Arjun sees the approved view and a hidden-claim
  placeholder, acknowledges 2 sections, asks a follow-up → Meera answers it → receipt shows ack times → Reset demo restores
  the seed. Passes in ~55 s on a clean build.

## 3D components (`src/components/three/`)
Always import from `@/components/three/lazy` (client-only `next/dynamic` with `ssr:false`; the fallback has the
same size as the scene; an error boundary shows the static fallback if WebGL fails; scenes mount on idle (hero)
or within 300px of the viewport). Shared rules live in `shared.tsx` `SceneCanvas`: dpr `[1, 1.75]`,
`frameloop="demand"` when off-screen/tab hidden (last frame stays), a single static frame under
`prefers-reduced-motion`, and no zoom controls.

- `LazyHeroStack` (`HeroStack.tsx`): `{ layers?: {key, label, sub?, color}[] (4), grades?: Partial<Record<Grade, number>>,
  approvedLabel?, approvedSub? }`. Fills its parent (give it a height). Labels are DOM overlays projected each
  frame (drei `<Html>` occasionally rendered an empty portal for the first label).
- `LazyPipelineStaircase` (`PipelineStaircase.tsx`): `{ stages: { key, label, status: "idle"|"running"|"done"|"error",
  count?, unit?, color? }[], compact?: boolean }`. Height 260px (compact 132px), full width. Ortho camera fitted
  to the stairs' bounding box on resize. Done = stage colour + count on the front face; running = amber edges +
  pulse; error = red. Full mode: label + status under each block; compact: one "2/5 done · Verify running" caption.
  Stage colours by key: connect blue, reconstruct violet, verify teal, review/handover amber.
- `LazyEvidenceConstellation` (`EvidenceConstellation.tsx`): `{ nodes: ({type:"source", id, kind, access, title?} |
  {type:"claim", id, grade, title})[], edges: {claimId, sourceId, relation:"SUPPORTS"|"CONTRADICTS"}[],
  hiddenCount?, onClaimClick?(id), className? }` (default height 300px; set it with `className`, e.g. `h-[360px]`).
  Deterministic O(n²) force layout computed once (max 120 nodes: all sources, then claims by severity; overflow
  shown as "showing N of M"). Sources = matte cubes by kind with access rings (Team solid, Restricted dashed
  amber double); claims = spheres by grade; MISSING without evidence = hollow on the rim; CONTRADICTS = red dashed.
  Hover: tooltip (title, grade, source count) + dims unrelated edges + pauses rotation; click calls `onClaimClick`.
  Build nodes/edges server-side from `loadClaims` (hidden claims must never be sent, only `hiddenCount`).

### Wire after merging `pipeline` (DONE in Phase 4, kept for history)
Each placeholder zod-validates, runs `assertCan` on the server, then returns `pendingResult()` without writing:
`pipeline.ts` runPipeline / addGithubSource / uploadSources / labelSource / grantSourceToIncoming,
`claims.ts` editClaim / rejectClaim / requestAccess, `conflicts.ts` resolveConflict,
`interview.ts` answerGapQuestion, `review.ts` approveVersion, `handover.ts` acknowledgeSection / askFollowUp /
answerFollowUp. Replace the body with the real mutation + `writeAudit` + `refresh()`; the UI already shows toasts.
- Handover page: when a `RoleView` exists, render its `compiled` JSON instead of `getHandoverView`'s draft
  (the layout already expects overview, sections with citations, plan7, plan30).
- Sources stepper: swap "Replay" for the SSE stream of a real run and add `LazyPipelineStaircase` (map the 8 SSE
  stages onto the 5 phases). Dashboard: replace the static SVG `Constellation` (fixed 300px slot) with
  `LazyEvidenceConstellation className="h-[300px]"` and `onClaimClick` → `ledger?claim=<id>`.

## Next
1. After the Gemini quota resets: `env -u GEMINI_API_KEY npm run seed:pipeline`, commit `seed/pipeline-metrics.json`
   (and the cache only if replaced). Set the key + `GEMINI_MODEL` on Render.
2. `/new` wizard and `?tour=1` handling (other session, branch `ui`); merge it into `pipeline`, then `pipeline` → `main`.
3. Deploy to Render and run `npm run e2e` against a local build pointed at the Render DB once more after the deploy.
4. Polish: template plan text uses the claim date for deadlines ("Deadline 2026-04-08: Registrations close 28 April");
   the sidebar hidden count includes rejected claims while role views exclude them (57 vs 56 for Kabir).

## Known issues
- **Stale shell variable:** an old 19-char `GEMINI_API_KEY` is exported in the local shell, and dotenv never overrides
  existing variables, so local scripts use the stale key unless run with `env -u GEMINI_API_KEY ...`. Remove it from
  your shell profile. Also set the new key and `GEMINI_MODEL=gemini-3.5-flash` in the Render dashboard (render.yaml has the model).
- **Free-tier key:** 20 requests/day, and one FestFlow LIVE run needs about 23 calls (18 extract + canonicalise + conflicts +
  gaps + questions), so a full live run cannot finish on one day's quota. In-app LIVE runs will mostly fall back to the
  cache (mode CACHED with a notice). Answers already in LlmCache are free.
- Without a working model, LIVE runs on FestFlow fall back to the cache (mode CACHED, with a notice on the run) and LIVE
  runs on new projects fail with "Nothing was changed".
- `npm run e2e` and Reset demo write to the shared Render DB, which the `ui` session also uses; the test resets FestFlow
  at the start and the end.
- Handover page renders in ~1.2 s warm from a laptop (draft preview compiles per request; Render Singapore round trips).
  Trust page ~1 s (leakage report compiles 4 roles per render).
- Testimony fallback (no model): conflict settlement uses a token heuristic on the answer's first sentence; unclear answers
  leave the conflict OPEN with resolution `ASKED`.
- Trust `accuracy` scores the *current* ledger. Reviewer rejections (e.g. resolving a conflict A/B) lower conflict recall until reset.
- `next dev` here did not hot-reload API route changes during testing; restart the dev server after editing `src/lib`.
- Both branches share the Render DB: the pipeline branch's test runs (new testimony, v1/v2 approvals) show up in the
  UI immediately. Use Reset demo to get back to the seed.
- Running `npm run build` while `npm run dev` is up can leave `.next` stale and cause a dev reload loop:
  stop dev, `rm -rf .next`, restart.
- Sidebar does not collapse to icons; layout is tuned for 1280px and wider.
- `pg` prints an SSL-mode deprecation warning for `sslmode=require` (treated as verify-full today;
  works). Switch the URL to `sslmode=verify-full` to silence it if it gets noisy.
- `/api/demo/reset` takes ~5s from a laptop to Render Singapore (one transaction, createMany); should be
  faster from the Render web service. The rate limit is per server instance (fine for one free instance).
- Seeded claim ids are fixed strings (`clm_*`, `chk_*`, `src_*`); new projects use cuids.
- Prisma 7: generated client lives in `src/generated/prisma` (gitignored, created by `postinstall`).
- Local `.env` had the Render URL pasted in front of the key on line 1; fixed in place (backup in
  `.env.bak`, gitignored, safe to delete).
