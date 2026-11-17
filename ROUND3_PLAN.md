# Round 3 plan (resume point)

Score tags: **C25** completeness · **I20** three promised improvements · **R20** reliability ·
**U20** usability · **D15** docs & roadmap.
Status: `[ ]` todo · `[~]` in progress · `[x]` done (committed, all suites green) · `[-]` cut (listed in SUBMISSION.md).

Rules: after each milestone run `npm run check` on the LOCAL database
(`DATABASE_URL=postgresql://localhost:5432/baton_dev`), then commit and push `main`.
Migrations additive only. Tests use `LLM_DISABLED=1`. Never print secrets.
Full design: `~/.claude/plans/pasted-content-id-cb83-round-3-scalable-sketch.md` (local), summarised here.

Build order (agreed): M0 → M1 (B2) → M2 (A1) → M3 (A2) → M4 (A3) → M5 (B1, C, D) → M6 (B5, B3, B4) → M7 (F).
Budget under 12 h. Cut order if behind: B4, B3, full 390px sweep, Start-here extras. E is cut.

## M0 Setup
- [x] Local Postgres 17 (brew), `baton_dev`, migrate + seed — R20
- [x] `npm run check` (typecheck, lint, unit, build, QA, e2e, judge) — R20
- [x] This file — D15

## M1 B2 Per-visitor sandbox — R20, C25
- [x] Project.kind/visitorId/templateSlug/idSuffix/expiresAt/template (migration)
- [x] Signed visitor cookie `baton_vid` via `src/proxy.ts`
- [x] `resolveProject` choke point; `/p/festflow` redirects to the visitor's copy
- [x] Clone in one transaction (id suffix); Reset demo resets only the caller's copy
- [x] /new projects visible only to their creator
- [x] Cleanup: startup + hourly guard + `GET /api/cron/cleanup` (ADMIN_TOKEN)
- [x] Cache, ground truth, tour, tests adapted to suffixed ids
- [x] Unit + integration tests (clone, reset, cleanup, isolation)

## M2 A1 Ask the handover — I20, U20
- [x] Corpus = approved version (else draft, labelled) ∩ persona's allowed chunks
- [x] BM25 + topic boosts, top 8 chunks + matching claims
- [x] Citation validator (drops uncited/unknown citations, string-checks quotes), canary scan
- [x] Refusal "This isn't in the approved handover" + one-click "Ask <leaver>" → FollowUp → testimony
- [x] Offline extractive fallback
- [x] `/p/[slug]/ask` page + Ask box on top of the handover; citations open the evidence drawer
- [x] Trust "Q&A safety" (answers, refused, citation validity, leaks)
- [x] Ask Baton = how-to; routes project questions to Ask the handover
- [x] Unit tests (validator, refusal, persona filtering, canary) + QA spec

## M3 A2 Knowledge-at-risk radar + continuous handover — I20
- [x] SyncState, Source.externalId, Chunk.meta, Claim.createdAt, run lock (migration)
- [x] Incremental GitHub sync (SHA/updated_at/ETag), "Sync now", webhook with HMAC
- [x] Incremental pipeline preserving edits, testimony, resolutions
- [x] Radar page: bus factor, single owners, one-source decisions, secrets without owner, stale tasks, per-person concentration, actions
- [x] 3D radar (towers, hover, click, rotate, legend, static fallback, reduced motion)
- [x] Change detection vs approved version, banner, Draft v2 (changes only), "What changed since v1", badge
- [x] "Simulate new activity" from `seed/later-activity/` via the same path
- [x] Unit tests (no duplicates on re-sync, diff classes, risk scoring) + QA spec

## M4 A3 Slack connector — I20
- [x] AES-GCM token encryption; Connection table
- [x] OAuth v2 with signed state; signing-secret verification on events
- [x] Demo workspace import via SLACK_BOT_TOKEN (server-only)
- [x] Channel picker, pagination, Retry-After, public→TEAM, private→RESTRICTED, owner override, invite hint
- [x] Permalinks + "Open in Slack"; redaction before storage; incremental re-sync (since last ts)
- [x] Export ZIP upload; not-configured fallback
- [x] Trust: % Confirmed before/after Slack
- [~] Seed demo workspace: script ready (`npm run slack:seed-demo`); BLOCKED on the user adding write scopes. Fallback shipped: FestFlow sample export ZIP
- [x] Unit tests + docs/SLACK.md

## M5 B1 + C + D — C25, R20, U20
- [~] B1 role-aware Next step; "claims"→"facts"; guide step in DB; PDF upload + scanned-PDF error (PDF done with M4)
- [ ] C zod messages/max lengths; idempotency; run lock + reconnect; error boundaries; fetch timeouts; logs; /api/health + /status
- [ ] C judge-alone suite (bad input, empty project, double-click, refresh mid-run, persona switch, 390px, axe, 20 concurrent)
- [ ] D welcome modal; header strips; Start here + knowledge base cover new features; 9-step tour; screenshot sweep + fixes

## M6 B5, B3, B4 (slim) — C25, U20
- [ ] B5 Markdown + JSON export, signed read-only share link
- [ ] B3 role invite links (hashed, expiry, revoke); switcher labelled "Demo mode"
- [ ] B4 templates (club, research lab, startup) in /new

## M7 F Docs + finish — D15
- [ ] README rewrite, screenshots, docker-compose (unverified), `npm run setup`, fresh-clone check
- [ ] ARCHITECTURE, API, TESTING, SECURITY, DEPLOY, SLACK, CHANGELOG, ROADMAP, LICENSE, CONTRIBUTING
- [ ] SUBMISSION.md with real numbers + Team roles placeholders
- [ ] Clean production test projects/sandboxes, deploy green, judge suite vs live URL

## Cut / not done
- [-] E: extra 3D (approval animation, constellation sync glow, Slack node type, Lighthouse re-run)
- docker-compose.yml not executed (no Docker on the build machine)

## Needs the user
1. Slack app: add `channels:manage`, `groups:write`, `chat:write`, `chat:write.customize`; reinstall to "Baton Demo"; update SLACK_BOT_TOKEN if it changes; confirm redirect URL; enable public distribution for other workspaces.
2. Render env: ADMIN_TOKEN, NEXT_PUBLIC_APP_URL set; optional ENCRYPTION_KEY, GITHUB_WEBHOOK_SECRET.
3. Team roles section in SUBMISSION.md.

## Log
- M0 done: local Postgres, `scripts/local-env.sh`, `npm run check`. Fixed 6 pre-existing lint errors.
- M1 done: sandbox per visitor (`src/proxy.ts`, `src/lib/sandbox.ts`, `src/lib/visitor.ts`, `src/lib/demo.ts`); tests use a fixed signed visitor (`tests/visitor.ts`).
- M2 done: `src/lib/ask/*`, `/p/[slug]/ask`, Ask box on the handover, Trust "Q&A safety", Ask Baton routes project questions. Suites: unit 236, e2e 5, QA 22.
- M3 done: incremental sync (`src/lib/pipeline/incremental.ts`, `appendRawSources`), GitHub delta + ETag + signed webhook, SyncState + run lock (partial unique index), change detection (`src/lib/handover/changes.ts`), banner / Draft v2 (`/review?changes=1`) / "What changed since vN" / "vN new" badge, radar (`src/lib/radar/*`, `/p/[slug]/radar`, 3D `RiskRadar`), Simulate new activity (`seed/later-activity/`). Suites: unit 249, e2e 5, QA 24.
- Decision (M3): the simulated batch uses a prepared extraction (`seed/later-activity/prepared.json`) as its cache, like the FestFlow pipeline cache; quotes are still re-validated against the stored chunks. Real Sync now uses the engine chain (Groq -> Gemini -> rules).
- M4 done: Slack connector (`src/lib/connectors/slack/*`, `src/lib/crypto.ts`): demo token, OAuth v2 (signed state + nonce cookie), events endpoint (v0 signatures), channel picker with access override and invite hint, export ZIP (Sources and /new), Open in Slack, re-sync by ts, Trust before/after. Also .pdf upload (unpdf) with scanned/locked PDF errors. Suites: unit 264, e2e 5, QA 26.
- Decision (M4): demo Slack token has read scopes only and the bot is in no channel, so the demo workspace can't be seeded. Shipped the seeding script plus a FestFlow sample Slack export (`public/samples/festflow-slack-export.zip`, `npm run slack:sample`) on the same importer; sample content uses a prepared extraction on the demo project (like the pipeline cache). Listed as a limitation until scopes are added.
- Decision (M4): DB test files clean up only their own visitor ids (parallel vitest files raced on a shared prefix).
- Decision (M3): radar questions dedupe on same text, same related fact, or (single-owner) same area name, so the seeded email-templates question is not duplicated.
- Incident (M3): 4 QA timeouts were the Mac sleeping mid-gate (specs 04/05 took ~16 min wall time). Timed every page x 4 personas on a fresh server: all < 0.3 s; QA 01-03 pass in 1.2 min. Checked suspects: sandbox clone runs once per visitor (findUnique first), cleanup timer guarded per process, new tables indexed, no N+1 in radar/diff. Fix: `scripts/check.sh` now runs under `caffeinate`.
