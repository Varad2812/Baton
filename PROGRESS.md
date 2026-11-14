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

### Wire after merging `pipeline` (placeholders in `src/app/_actions/*`)
Each placeholder zod-validates, runs `assertCan` on the server, then returns `pendingResult()` without writing:
`pipeline.ts` runPipeline / addGithubSource / uploadSources / labelSource / grantSourceToIncoming,
`claims.ts` editClaim / rejectClaim / requestAccess, `conflicts.ts` resolveConflict,
`interview.ts` answerGapQuestion, `review.ts` approveVersion, `handover.ts` acknowledgeSection / askFollowUp /
answerFollowUp. Replace the body with the real mutation + `writeAudit` + `refresh()`; the UI already shows toasts.
- Handover page: when a `RoleView` exists, render its `compiled` JSON instead of `getHandoverView`'s draft
  (the layout already expects overview, sections with citations, plan7, plan30).
- Sources stepper: swap "Replay" for the SSE stream of a real run; 3D stepper + constellation (dashboard slot is
  a fixed 300px static SVG so the R3F canvas drops in without layout shift).

## Next
1. Phase 2: `src/lib/llm.ts` + pipeline stages (reuse adapters/normalise/quotes), `seed:pipeline`
   (currently a placeholder) to regenerate the cache live; score against ground truth.
2. Merge `ui` + `pipeline`, connect the placeholder actions listed above.
3. Landing page with 3D hero, `/new` wizard, 3D pipeline stepper and evidence constellation.

## Known issues
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
