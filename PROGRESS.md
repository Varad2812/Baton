# Progress

## Round 3 polish (2026-11-18): information architecture and UI simplification
- Trigger: first-time user feedback "too much on every page; Add sources buried". Every feature kept.
- Nav (`src/components/shell/nav.ts`, `sidebar.tsx`): journey groups Overview · 1 Collect · 2 Understand ·
  3 Fill gaps · 4 Approve · 5 Hand over, done/current dots (`src/lib/views/journey.ts`), role-first items
  (`ROLE_PRIMARY`), the rest under More. Stepper row removed. Help menu (`help-menu.tsx`): tour, guide, glossary.
- Home = role card (`role-card.tsx`, one Next step) + Analysis complete (with readiness) + 3 tiles.
  New `/insights` (Timeline · Evidence map 3D · Activity) holds the old dashboard panels.
- Sources: one "Add sources" button → `/sources/add` (Upload · GitHub · Slack with demo / connect / export);
  tabs All sources · Keep it current · Pipeline runs (`LinkTabs`, URL `?tab=`); readable table + Columns menu.
- One job per page: Try this strips removed; tabs on Conflicts, Questions (Follow-ups), Knowledge at risk,
  Safety checks; Ask explanation collapsed; Facts filters collapse below lg; handover Share & export menu.
- Start here = "Guide n/8" pill + drawer (closed by default; opens once after "Explore").
- Draft helper renamed Smart Draft everywhere. Demo Slack import verified live (67 → 88 facts, 3 → 5 conflicts).
- Known: tabs render only the active panel, so deep links use `?tab=` (tour, guide, tests updated).
- Suites (local, all green): unit 285, e2e 5, QA 28, judge 12 (axe 0 serious/critical on every page and tab).

## Round 3 (2026-11-17): see ROUND3_PLAN.md (checklist + decisions log) and SUBMISSION.md
- Delivered: Ask the handover (A1), Knowledge-at-risk radar + continuous handover (A2), Slack connector (A3),
  per-visitor sandboxes, exports + share link, PDF uploads, reliability work, judge-alone suite, welcome +
  9-step tour, full docs set. Cut: B3 invites, B4 templates, E extra 3D.
- Local test gate: `source scripts/local-env.sh && npm run check` (local Postgres only; refuses a busy port).
- Suites: unit 267, e2e 5, QA 27, judge 12. Coverage src/lib 58.6% lines.
- Known: webhook secret not set on Render. (Demo Slack workspace: seeded and verified live on 2026-11-18.)


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
  demo" → `/p/festflow`, "Start your own handover" → `/new` (wizard, Phase 3c),
  "60-second tour" → `/p/festflow?tour=1` (starts the guided tour, Phase 3c), 3 USP rows, HeroStack scene,
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

- `LazyHeroStack` (`HeroStack.tsx`): `{ layers?: {key, label, sub?, color, blurb?, extracts?}[] (4), grades?: Partial<Record<Grade, number>>,
  approvedLabel?, approvedSub? }`. Fills its parent (give it a height; the bottom ~60px holds the caption bar).
  `blurb` (hover card) and `extracts` (click caption) default by key (`github|chat|notes|tasks`). Labels are DOM overlays
  projected each frame to each slab's screen-right edge, so they stay put while the stack is rotated.
  Interaction: drag to rotate (drei OrbitControls: damped, tilt limited, no zoom/pan, touch-action `pan-y` so mobile
  scroll still works; auto-rotate resumes 3 s after the last drag, never during a tour/selection/reduced motion);
  hover a slab = lift + glow + label card; click = slab slides out, its particles flow into the approved slab, caption
  says what Baton extracts (click again / empty space / approved slab clears); "Play how it works" = 10 s scripted tour
  (collect, extract, verify with green ticks, hand over) with a 4-segment caption bar and Stop. Reduced motion: no
  auto-rotate, snapping poses, tour becomes a "Next step" walkthrough. Mutable scene state lives in a `Sim` ref
  (no React re-render per frame).
- `LazyPipelineStaircase` (`PipelineStaircase.tsx`): `{ stages: { key, label, status: "idle"|"running"|"done"|"error",
  count?, unit?, color?, progress?, description? }[], compact?: boolean, onStageClick?(key) }`. Height 260px (compact 132px),
  full width. Ortho camera fitted to the stairs' bounding box on resize. Each block has a real `<button>` hit area
  (hover/focus = "What happens here" tooltip with plain-English text + count; click/Enter = `onStageClick`). Running =
  amber edges + pulse + progress ring on the top face (`progress` 0..1 fills it, omitted = looping ring); done = stage
  colour + count + check; error = red + x. Full mode: label + status under each block and a caption line under the scene
  that follows the running stage (or "Next: X" / "Complete"); compact: one "2/5 done · Verify running" caption.
  Copy per stage key lives in `HELP` (connect, reconstruct, verify, review, handover); `description` overrides it.
  Stage colours by key: connect blue, reconstruct violet, verify teal, review/handover amber.
- `LazyEvidenceConstellation` (`EvidenceConstellation.tsx`): `{ nodes: ({type:"source", id, kind, access, title?} |
  {type:"claim", id, grade, title})[], edges: {claimId, sourceId, relation:"SUPPORTS"|"CONTRADICTS"}[],
  hiddenCount?, onClaimClick?(id), onSourceClick?(id), highlightClaimId?, className? }` (default height 300px; set it with
  `className`, e.g. `h-[360px]`). Deterministic O(n²) force layout computed once (max 120 nodes: all sources, then claims
  by severity; overflow shown as "showing N of M"). Sources = matte cubes by kind with access rings (Team solid,
  Restricted dashed amber double); claims = spheres by grade; MISSING without evidence = hollow on the rim;
  CONTRADICTS = red dashed. Drag to rotate (damped, no zoom/pan, slow auto-rotate that pauses while hovering/filtered and
  resumes 3 s after a drag). Hover a claim: its edges + sources light up, everything else dims, camera dollies toward it
  along the ray (so it stays under the pointer). Hover a source: "N claims from <title>". Click a source: filter to its
  claims (chip with Clear; click empty space also resets) and calls `onSourceClick`; click a claim calls `onClaimClick`.
  `highlightClaimId` keeps a claim lit while nothing is hovered. Legend overlay explains grade colours, lines =
  evidence, red dashed = contradiction, cubes = sources.
  Build nodes/edges server-side from `loadClaims` (hidden claims must never be sent, only `hiddenCount`).
- Lighthouse (desktop, production build, `/`): 88-100 with a real GPU or no WebGL; 68 under software WebGL (swiftshader,
  TBT ~1.2 s from shader compile/first render), CLS 0, LCP 0.7-1.0 s.

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

### Phase 3c (branch `ui`): `/new` wizard + guided tour
- **`/new`** (`src/app/new/page.tsx`, components in `src/components/new-project/`): 4 steps (Project, People,
  Sources, Run) with a left progress rail (done / current / invalid states, click to go back), inline zod validation
  (shown on blur or on Continue, focus jumps to the first invalid field), and a right "What happens next" panel
  (5 stages, one line each, plus accepted types / access labels / model-input notes).
  - Project: name, slug (auto from name, editable, "reset to match the name"; reserved: festflow, new, api, p,
    styleguide, admin), one-line description (8–140 chars, counter).
  - People: departing (OWNER), incoming (INCOMING), reviewer (REVIEWER), name + role title each. The reviewer and the
    successor must differ from the departing person (no self-approval).
  - Sources: drag-and-drop or browse (.md .txt .csv .json .docx, 5 MB each, 20 files; others listed as "skipped"
    with the reason), file table with detected kind (Doc / Chat export / Tasks CSV / Notes), what was found
    ("16 messages · #dev · 3 authors", "10 cards · 4 lists"), "N to redact" (secret/email/phone-like strings, same
    patterns idea as `normalise.ts`), size, and an access menu (Public / Team / Restricted with what each means;
    files named budget/sponsor/finance/… default to Restricted). Optional public GitHub URL.
    Detection is client-side preview only (`schema.ts` `detectFile`); the server must re-detect on ingest.
  - Run: summary (project / people / sources, each with Edit), "Build handover", `LazyPipelineStaircase`, the
    8-stage list and a run log. Today every action answers "will work after merge": the run stops after
    `createProject`, says "Nothing was saved" and links to the FestFlow sources page.
  - **"Try with sample files"** (header of the wizard): fetches `public/samples/` (MessMate, a hostel mess-menu app:
    `messmate-meeting-2026-09-18.md`, `messmate-chat-export.json` in DiscordChatExporter shape, `messmate-tasks.csv`
    in the Trello CSV shape), pre-fills project + people where empty and jumps to Sources. Story beats: Heroku →
    Render (decision), weekly-Sunday vs daily-6am menu sync (conflict), "Build fails on Windows" twice (recurring),
    fake `mmk_live_…` token + contractor email (redaction), MSG91 account on a personal phone with no owner (gap).
- **Guided tour** (`src/components/tour/`, no library): `<Tour />` is mounted by ONE line in
  `src/app/p/[slug]/layout.tsx` (`{await import("@/components/tour").then((m) => <m.Tour />)}`, no import line, so
  the merge diff stays one line). Starts on `?tour=1` (the landing "60-second tour" link) or from `<TourButton />`.
  7 steps on `/p/festflow`; each navigates, switches persona through the existing `setPersona` action when needed
  (steps 1–4 Meera, 5 Prof. Rao, 6–7 Arjun), waits for the route to commit (Next disabled meanwhile), polls for
  `[data-tour="…"]`, scrolls it into view and cuts it out of a dimmed backdrop. Missing target after 1.6s → popover
  centred with a one-line note (never breaks). Step counter, progress bars, Next / Back / Skip, ← → Esc (captured
  before the ledger drawer sees Escape), Tab stays in the popover, focus returns to the opener. Completion is stored in
  `localStorage["baton.tour.v1"]` = `{ outcome: "completed"|"skipped", step, at }` (try/catch); the in-progress step
  is in `sessionStorage` so a hard reload resumes. The root carries `data-state="loading|searching|anchored|centred"`
  for tests. Verified with Playwright: all 7 steps centred today; all 7 anchored when the attributes are injected.

### Wire after merging: `/new` server actions (`src/app/_actions/new-project.ts`)
All three already zod-validate with the shared schemas in `src/components/new-project/schema.ts` and return
`NewProjectResult<T> = ({ ok: true } & T) | { ok: false; reason: string; pending?: boolean; fieldErrors?: Record<string,string> }`
(today `{ ok: false, pending: true, reason: "will work after merge" }`). Keep these exact signatures:
```ts
createProject(input: CreateProjectInput): Promise<NewProjectResult<{ projectId: string; slug: string }>>
//   input = { name, slug, description, people: { departing, incoming, reviewer: { name, roleTitle } } }
//   Create Project + 3 Person rows + Handover(DRAFT, from=departing, to=incoming, reviewer). Slug taken →
//   { ok:false, reason, fieldErrors: { slug: "Taken" } }. AuditLog "project.create".
uploadSources(formData: FormData): Promise<NewProjectResult<{ sources: { id: string; title: string; kind: string; access: string }[] }>>
//   fields: slug, files (File, repeatable), access (repeatable, same order: PUBLIC|TEAM|RESTRICTED), githubUrl?
//   The wizard sends ONE file per call (then one call with only githubUrl). Re-detect kind server-side
//   (adapters.ts: chatSources / trelloSource / markdownSource / sheetSource; mammoth for .docx). GitHub = PUBLIC.
//   Set next.config.ts `experimental.serverActions.bodySizeLimit: "6mb"` (default 1 MB < 5 MB file limit).
startPipeline(input: { slug: string; mode?: "CACHED" | "LIVE" }): Promise<NewProjectResult<{ runId: string; streamUrl: string }>>
//   Create PipelineRun and return streamUrl = `/api/projects/${slug}/pipeline`. The wizard then
//   POSTs to streamUrl (Accept: text/event-stream) and reads `data: {"stage","status","counts","ms"}` events;
//   stage ∈ ingest|normalise|extract|validate|grade|conflicts|gaps|questions, status running|done|error
//   (also accepts succeeded/failed), optional `{"error": "..."}` event. Stream end = run finished. Counts it shows
//   on the staircase: sources|chunks (connect), claims, valid|quotes|verified (verify), questions (review).
```
Who may call them: there is no login; anyone may create a project (the creator acts as its OWNER). Rate-limit
per IP like `/api/demo/reset`. After a successful run the wizard links to `/p/<slug>`.

### Wire after merging: `data-tour` attributes to add (pages are untouched on `ui`)
| Step | Page | Attribute | Put it on |
|---|---|---|---|
| 1 | `/p/[slug]` dashboard | `data-tour="kpis"` | the 5-up KPI row (`<div className="grid grid-cols-5 gap-3">` around the `Stat`s) |
| 2 | `/p/[slug]/ledger?claim=clm_auth_supabase` | `data-tour="ledger-claim"` | inside the claim drawer: the "Why this grade" + Evidence block of `claim-detail.tsx` (whole drawer also works; the popover goes left) |
| 3 | `/p/[slug]/conflicts` | `data-tour="conflict-payment"` | the payment-gateway conflict card (`cf.topicKey === "payment_gateway"` / id `cf_payment`), only that one |
| 4 | `/p/[slug]/interview` | `data-tour="interview"` | the first (highest-priority) open gap question card |
| 5 | `/p/[slug]/review` | `data-tour="approve"` | the "Approve as v1" button in `approve-panel.tsx` (or its Approval card) |
| 6 | `/p/[slug]/handover` (as INCOMING) | `data-tour="hidden-claim"` | the first "N claims hidden — request access from owner" placeholder |
| 7 | `/p/[slug]/trust` | `data-tour="leakage"` | the "Leakage matrix" card |
Also place `<TourButton />` (from `@/components/tour`) in the top bar next to the persona switcher.

## Next
1. After the Gemini quota resets: `env -u GEMINI_API_KEY npm run seed:pipeline`, commit `seed/pipeline-metrics.json`
   (and the cache only if replaced). Set the key + `GEMINI_MODEL` on Render.
2. `/new` wizard and `?tour=1` handling (other session, branch `ui`); merge it into `pipeline`, then `pipeline` → `main`.
3. Deploy to Render and run `npm run e2e` against a local build pointed at the Render DB once more after the deploy.
4. Polish: template plan text uses the claim date for deadlines ("Deadline 2026-04-08: Registrations close 28 April");
   the sidebar hidden count includes rejected claims while role views exclude them (57 vs 56 for Kabir).
5. Phase 2: `src/lib/llm.ts` + pipeline stages (reuse adapters/normalise/quotes), `seed:pipeline`
   (currently a placeholder) to regenerate the cache live; score against ground truth.
6. Merge `ui` + `pipeline`, connect the placeholder actions listed above.
7. After merge: implement the 3 `/new` actions + `POST /api/projects/[slug]/pipeline` (SSE), add the 7 `data-tour`
   attributes and `<TourButton />` (tables above); drop the 3D staircase and constellation into the sources page
   and dashboard (see "Wire after merging").

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
- Tour: steps show centred popovers until the merge session adds the `data-tour` attributes. The tour changes the
  persona cookie (ends as Arjun); the last step says how to switch back. `/new` builds nothing until merge.
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

### Submission push (2026-11-15)
- FestFlow dismissible "synthetic, pre-analysed, saved live" banner on the dashboard (links to /new).
- Audit/activity rows show relative times ("just now", "3 min ago") that tick every 30 s.
- Run badge everywhere a run is shown (dashboard, sources stepper, /new): `LIVE · model · N calls · Xs`,
  `CACHED · replay`, or `CACHED (AI quota reached)` when a LIVE request fell back. Done SSE event now carries
  `llmCalls`, `model`, `fellBack`.
- Persona names/dates in landing, dashboard, sources, review and server-action messages come from the DB.
- Verified: typecheck, build, 166 unit tests, 3/3 e2e (LLM_DISABLED=1).

## Known issues / next
- Owner/successor names in client labels now come from the project handover via `PeopleProvider`
  (`src/components/common/people-context.tsx`). Styleguide and tour copy are FestFlow-specific by design.
- Deleted the leftover e2e project (`messmate-e2e-*`) from the Render DB; only FestFlow remains.

### LLM fallback chain (2026-11-15)
- `src/lib/llm.ts`: Gemini fails fast on 429/RESOURCE_EXHAUSTED/quota (no retries, marked dead for the run),
  20 s per-call timeout. Fallback: Groq (`GROQ_API_KEY`, `GROQ_MODEL`, default `openai/gpt-oss-120b`, JSON mode,
  same zod validation + quote validator, no retries). `LLM_DISABLED=1` skips Gemini only.
- `src/lib/pipeline/rules.ts`: rule-based extractor + conflict labeller (no network). Used per stage when no
  engine is reachable; questions fall back to templates. Claims carry "Provenance: rule-based" in reviewerNote.
- Engine per stage in `PipelineRun.stages[].engine`; run-level label in `PipelineRun.model`
  (`gemini-…` | `groq:<model>` | `rule-based`). Badge: "LIVE · Groq <model>" / "RULE-BASED · no AI available".
- FestFlow (cacheable) still falls back to the verified cache, never to rules.
- Verified: /new samples → Groq 18.9 s (34 claims, 40 valid quotes); rule-based 7.5 s (20 claims, 10 questions).

### QA pass (2026-11-15)
- `npm run qa` (`playwright.qa.config.ts`, `tests/qa/*`) runs against a server already started on :3000; see `QA_REPORT.md`.
- Fixed: version diff flagged every claim after approval; sample cast leaking into new projects (observer persona, trust empty
  state); hardcoded "Ask Meera"; fixed Jan–May axis and "fest" marker; empty Knowledge-at-risk; clipped run badge.

### Instant-understanding redesign (2026-11-15, after merging `ui`)
First-time judge feedback: "doesn't feel like a finished analysis; didn't understand a single feature; UI is complex."
- **Merged `ui`** (interactive 3D). Constellation legend no longer wraps mid-item.
- **Dashboard**: "Analysis complete" card first (counts from DB via `summariseRead` in `lib/views/dashboard.ts`, count-up,
  stacked grade bar, Before/After), then one big **Next step** button (`lib/views/next-step.ts`, unit-tested).
- **Plain labels** (UI only, DB enums unchanged): Facts & evidence, Questions for <owner>, Review & approve,
  <successor>'s handover, Safety checks. Grades: Confirmed (2+ sources), Single source, AI inference (unconfirmed),
  Conflicting, Missing (`GRADE_LABEL` / `GRADE_SHORT` / `GRADE_HELP` in `lib/views/format.ts`). (i) tooltips via `ui/info.tsx`,
  Stat `help` prop, Glossary popover in the top bar. Nav labels use `{owner}`/`{successor}` templates (`navLabel`).
- **Start here** rail (`components/guide/start-here.tsx`, `lib/views/guide.ts`): 5 steps, "Do it" switches persona + navigates;
  DB-derived done state for conflicts/approval, localStorage (try/catch) for "seen" steps and open/collapsed.
- **Persona banner** under the top bar; role cards in the switcher.
- **Page headers**: one-sentence purpose + "Try this" (`shell/try-hint.tsx` highlights the target with `[data-try]`).
- **Handover as a document**: cover with from -> to, approved stamp or "Draft awaiting approval", serif headings,
  superscript citations, checklist-timeline plan, **Download PDF** (print CSS in `globals.css`).
- **Landing**: What/For/Why trust/Try it in 4 lines, 3-step visual, USPs with FestFlow examples.
- **3D wiring**: staircase click scrolls to the stage log; constellation source click -> `/ledger?source=<id>` (new filter + chip),
  claim click opens the evidence drawer.
- **Responsive shell**: sidebar becomes a menu overlay below md; grids collapse; verified at 390 px.
- Known: guide step "Check a fact's evidence" is tracked in the browser only (no DB signal). The Next step button is
  state-based, not role-based, so a successor may be pointed at conflicts only a reviewer can resolve.

### Ask Baton assistant (2026-11-15)
- **Panel** (`src/components/assistant/ask-baton.tsx`): "Ask Baton" button (MessageCircleQuestion) in the project top bar and the
  landing header; right Drawer with an intro line, 3 page-specific suggested questions (`suggestedQuestions` in
  `lib/assistant/actions.ts`), typing state, inline error + Retry. Answers carry fact chips (grade dot + title; click opens the
  evidence drawer via `?claim=`), action buttons (`nav:*` = existing routes, `persona:*` = the existing `setPersona` action) and a
  tiny engine label (Groq / Gemini / Offline). Conversation lives in component state only, survives navigation inside a project,
  and is cleared when the persona changes. Not streamed on purpose: the full answer must pass the leak scan before it is shown.
- **Knowledge**: `docs/assistant-knowledge.md` (what Baton is, pages, grades, roles, workflow, Start here, how to judge, FAQ with
  `<!-- keywords -->` hints, limitations). `knowledgeFor()` sends only the core sections + current page + top-5 FAQ (~4k chars)
  so Groq's free tier (≈8k tokens/min) fits 2+ questions a minute.
- **Context** (`lib/assistant/context.ts`, pure; `load.ts` DB): every claim re-filtered with `canSeeClaim` (all evidence rows,
  same rule as the ledger), conflicts only when both sides are visible, gap questions only for roles that see Team data,
  relevance by word overlap + page boost (max 12 facts), plan text from the role's own compiled view. `forbidden` =
  `forbiddenStrings()` from handover compilation (canaries in hidden chunks + hidden quotes).
- **Safety on every answer** (`service.ts`): history turns containing forbidden strings are dropped before the prompt;
  citations limited to visible facts, actions to the known catalogue; `scanForLeaks` on the reply -> refusal; `Redactor` pass on
  the text. Off-topic -> polite redirect.
- **Engines** (`engines.ts`): Groq (`GROQ_API_KEY`, `GROQ_MODEL`) -> Gemini (`GEMINI_API_KEY`, respects `LLM_DISABLED`) ->
  offline. One attempt each, 15 s timeout, 1,500 output tokens, zod-validated JSON, a 429 benches that engine for 60 s,
  in-memory answer cache only (nothing written to the DB). Offline engine (`offline.ts`): count templates (conflicts, missing,
  status, hidden, blockers, plan, next step) from persona-filtered data, typo-tolerant FAQ matcher (`match.ts`), fact search,
  "can't see that at your access level" for project-shaped questions (fixed vocabulary, never hidden facts' words).
- **API**: `POST /api/assistant` `{slug, page, message, history[]}` and `POST /api/assistant/draft`, zod-validated, persona
  from `getActor()`. Per IP: 20 messages / 10 min, then offline-only (label says so); hard 429 at 60.
- **Tests**: `src/lib/assistant/assistant.test.ts` (38: observer/incoming context never holds Team/Restricted quotes or the
  canary, FAQ matcher incl. typos and unrelated questions, engine order with fake transports, leak refusal, history scrub).
  `e2e/assistant.spec.ts`: Ask Baton on the dashboard, "What does Confirmed mean?" answered by the offline engine, a count
  question's citation opens the evidence drawer.
- Top bar: search box narrowed (168px below 2xl) so the breadcrumb is not truncated at 1440px with Start here open.

### Draft helper + testimony provenance (2026-11-15)
- **`DraftButton`** (`src/components/assistant/draft-button.tsx`, PenLine): a small "Draft" button in the corner of every
  free-text field; popover "Draft from notes" with optional rough notes -> Draft -> preview + engine label -> Insert / Replace /
  Cancel. Never submits. Fields (`lib/assistant/fields.ts`, each with the permission the server checks before any model call):
  new-project description, reject reason, fact statement and reviewer note (review), override / approval note, follow-up
  question, follow-up answer, interview answer, conflict resolution note, request-access reason.
- **Request access** now = one-click button (unchanged, QA relies on it) + "Add reason" dialog with a reason box and Draft
  (`components/handover/request-access.tsx`, used in ledger, conflicts, evidence drawer, handover).
- **Draft context** (`service.ts` `loadDraftContext`): only targets the persona can see (claim via `canSeeClaim`, conflict only
  if both sides visible, gap question / follow-up only if the related claim is visible, blockers from `approvalBlockers`),
  leak scan + redaction on the output, length capped per field.
- **Testimony rule**: interview and follow-up answers only rephrase the user's notes (popover notes, else the box's text).
  Empty -> "Type a few words of what you know and I'll make it clear." (no model call). A model draft that adds a name,
  number, acronym, email or URL not in the notes/question (`inventedTerms`) is replaced by `tidyNotes(notes)`.
- **Provenance**: new column `Source.meta Json @default("{}")` (migration `20261115000000_source_meta`, applied to Render).
  Answers sent after an Insert carry `assisted: true`; `writeTestimony` stores `{draftedWithAssistant, confirmedBy,
  confirmedAt}` (+ `followUpId` for follow-ups) and the audit meta gets `draftedWithAssistant`. Label "Drafted with assistant,
  confirmed by <persona>" (`AssistedLabel`) on answered interview questions, answered follow-ups and testimony evidence in the
  drawer. Insert/Replace writes audit `assistant.draft.used` (`_actions/assistant.ts`); chat messages are never logged.
- Draft button aria-label is generic ("Open the Draft helper") so it never collides with the field's own label in tests.
- Start here panel footer: "Stuck? Click Ask Baton". README: feature section 4, How to judge line, env vars.
- Breadcrumb hides the project crumb below 2xl (sidebar names it) so the page name stays readable with the new button.
- Verified: typecheck, build, 219 unit tests, 5/5 e2e, 16/16 QA (`QA_BASE_URL=http://localhost:3200`).

### Known issues (assistant)
- Groq free tier is ~8k tokens/min: about 2 questions a minute, then a 60 s bench and Gemini (20 requests/day on the free
  key) or the offline engine answers. The label under each answer says which.
- Offline answers are templates + FAQ; questions like "Which gateway should I pick?" get the relevant facts listed, not advice.
- Rate limits and the answer cache are per server instance (fine for one Render instance).
- Page latency on 2026-11-15 was 1.5-6 s per page from this laptop for both the old and new build (Render DB round trips),
  so e2e took 1.8-4 min depending on the hour.
