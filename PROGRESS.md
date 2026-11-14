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

### Wire after merging `pipeline` (placeholders in `src/app/_actions/*`)
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
1. Phase 2: `src/lib/llm.ts` + pipeline stages (reuse adapters/normalise/quotes), `seed:pipeline`
   (currently a placeholder) to regenerate the cache live; score against ground truth.
2. Merge `ui` + `pipeline`, connect the placeholder actions listed above.
3. After merge: implement the 3 `/new` actions + `POST /api/projects/[slug]/pipeline` (SSE), add the 7 `data-tour`
   attributes and `<TourButton />` (tables above); drop the 3D staircase and constellation into the sources page
   and dashboard (see "Wire after merging").

## Known issues
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
