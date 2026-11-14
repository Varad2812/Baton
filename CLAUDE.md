# Baton — Knowledge Handover Platform (Round 2 build)

> Hand over the project, not just the files.

Baton rebuilds a project's live state from authorised sources, grades every claim against
an exact quoted source span, asks the departing person only what the records can't
answer, and gives each successor an approved, role-safe continuation plan.

## Context you must keep in mind

- Hackathon Round 2. Judges open ONE public URL (Render) and must use the core workflow
  end to end **without any help, login or setup**. Only the top 3 teams win.
- We have ~12 hours. Prefer a complete, polished core over extra features.
- Always read `PROGRESS.md` at the start of a session and update it at the end
  (what's done, what's next, known issues). Commit after every working milestone.

## Non-negotiables

1. **Works on first open.** The demo project "FestFlow" is preloaded with a full pipeline
   result. No step requires an API key to *view*.
2. **Never breaks if Gemini fails.** Every LLM call has a cached result or a graceful
   fallback. Live runs are a bonus, never a dependency.
3. **No claim without a receipt.** A claim is never shown as VERIFIED unless its quote
   was string-matched in a real chunk. Inferred content is never styled as fact.
4. **Permissions are enforced on the server**, before any LLM call, never only in the UI.
5. **Not AI-looking.** Follow the design rules below strictly.
6. **Judges can't break it for each other.** "Reset demo" restores the seed in one click.

## Stack (single Render web service + Render Postgres)

- Next.js (latest stable, App Router) + TypeScript strict, `src/` dir
- Tailwind CSS; shadcn/ui primitives ONLY as a base, restyled to our tokens
- Prisma + PostgreSQL (Render Postgres; free tier has no persistent disk, so no SQLite)
- `@google/genai` for Gemini. Before writing the client, read
  https://ai.google.dev/gemini-api/docs/structured-output?lang=node and use the current
  API shape it shows. Model comes from `GEMINI_MODEL` (default `gemini-3.8-flash`).
- `three`, `@react-three/fiber`, `@react-three/drei` for 3D (client-only, lazy-loaded)
- `zod` (schemas), `recharts` (charts), `framer-motion` (subtle transitions),
  `lucide-react` (icons), `mammoth` (optional .docx text extraction)
- No Redis/queues: the pipeline runs in a route handler and streams progress via SSE.

Env vars: `DATABASE_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `ADMIN_TOKEN`,
`GITHUB_TOKEN` (optional, for live repo import), `NEXT_PUBLIC_APP_URL`.

## Demo identity (no login)

A "Viewing as" switcher in the top bar sets a cookie. Personas:

| Persona | Role | Notes |
|---|---|---|
| Meera Kulkarni | OWNER (departing tech lead) | answers gap interview |
| Prof. S. Rao | REVIEWER (faculty coordinator) | edits, resolves, approves |
| Arjun Mehta | INCOMING (successor) | reads handover, acknowledges, asks follow-ups |
| Kabir Shah | OBSERVER (club member) | read-only, Public data only |

All server code goes through `src/lib/authz.ts`: `getActor()`, `can(role, action)`,
`allowedAccess(role, projectId)`. Permission matrix:

| Action | Owner | Reviewer | Incoming | Observer |
|---|---|---|---|---|
| Connect / label sources | ✓ | – | – | – |
| See RESTRICTED claims | ✓ | ✓ | only if granted per source | – |
| See TEAM claims | ✓ | ✓ | ✓ | – |
| Edit / reject claims, resolve conflicts | ✓ | ✓ | – | – |
| Answer gap interview / follow-ups | ✓ | – | – | – |
| Approve a version | – (no self-approval) | ✓ | – | – |
| Acknowledge sections, ask follow-ups | – | – | ✓ | – |

Every mutation writes an `AuditLog` row.

## Domain model (Prisma)

- `Project` id, slug, name, description, createdAt
- `Person` id, projectId, name, roleTitle, handles String[] (identity map), email?
- `Source` id, projectId, kind (GITHUB_COMMIT | GITHUB_PR | GITHUB_ISSUE | DOC | CHAT |
  TASKS | TESTIMONY), title, uri?, access (PUBLIC | TEAM | RESTRICTED), authoritative Bool,
  author?, createdAt, grantedToIncoming Bool
- `Chunk` id, sourceId, ordinal, text (already redacted), locator ("L14", "msg #233",
  "PR #84 comment 2"), author?, timestamp?, access (inherited from source)
- `Redaction` id, chunkId, kind (SECRET | EMAIL | PHONE), placeholder. **Never store the
  secret value**, only that it exists and who mentioned it.
- `Claim` id, projectId, type (DECISION | TASK | RISK | DEPENDENCY | CONTACT | QUESTION |
  RECURRING), section, title, statement, topicKey, ownerPersonId?, date?,
  grade (VERIFIED | SINGLE_SOURCE | INFERRED | CONFLICTING | MISSING), gradeReason,
  status (DRAFT | EDITED | REJECTED | APPROVED), access (max of its evidence),
  fromTestimony Bool, reviewerNote?
- `Evidence` id, claimId, chunkId, quote, relation (SUPPORTS | CONTRADICTS),
  quoteValid Bool, matchStart?, matchEnd?
- `Conflict` id, projectId, topicKey, claimAId, claimBId, kind (CONTRADICTS | SUPERSEDES),
  status (OPEN | RESOLVED), resolution (A | B | BOTH | ASKED)?, note?
- `GapQuestion` id, projectId, kind (MISSING | CONFLICT | INFERRED | RECURRING |
  SINGLE_OWNER), question, rationale, priority Int, relatedClaimId?, checklistKey?,
  answer?, answeredAt?, testimonySourceId?
- `Handover` id, projectId, fromPersonId, toPersonId, reviewerPersonId,
  status (DRAFT | IN_REVIEW | APPROVED), currentVersion Int
- `HandoverVersion` id, handoverId, number, snapshot Json (immutable), approvedById,
  approvedAt, note
- `RoleView` id, versionId, role, compiled Json (overview, sections, plan7, plan30),
  hiddenCount, sourceChunkIds String[]
- `Acknowledgement` id, versionId, section, personId, at
- `FollowUp` id, handoverId, claimId?, section?, question, askedById, answer?, answeredAt?
- `PipelineRun` id, projectId, mode (CACHED | LIVE), status, stages Json, model,
  startedAt, finishedAt, error?
- `LlmCache` key (sha256 of model+prompt+schema) @id, response Json, createdAt
- `AuditLog` id, projectId, actorName, actorRole, action, targetType, targetId, meta Json, at

## Pipeline (`src/lib/pipeline/*`)

Stages, streamed to the UI as SSE events `{stage, status, counts, ms}`:

1. **Ingest**: fixtures, file uploads (.md .txt .csv .json chat export, .docx) or a public
   GitHub repo URL (commits, PRs + review comments, issues, README via REST).
2. **Normalise**: chunk to ~800 chars on natural boundaries, keep locators, inherit access,
   build the identity map (handles → Person), **redact** secrets (generic `KEY=`/token
   high-entropy patterns, known prefixes), emails and phone numbers before any LLM call.
3. **Extract** (Gemini, JSON schema, temperature 0.2, batched by source group,
   concurrency 2): claims with type, title, statement, topicKey, owner, date,
   `isInference`, and evidence `[{chunkId, quote}]`. The prompt must say: quotes must be
   copied verbatim from the given chunk text.
4. **Validate quotes** (deterministic): normalise whitespace, case and smart quotes, then
   exact substring match inside the cited chunk. Invalid evidence is dropped. A claim with
   no valid evidence becomes INFERRED if `isInference`, otherwise it is discarded.
5. **Grade**: VERIFIED = ≥2 valid SUPPORTS from ≥2 distinct sources, or 1 from an
   authoritative source (merged PR, approved notes); SINGLE_SOURCE = exactly 1;
   INFERRED = model inference; CONFLICTING = in an OPEN conflict. Store a human-readable
   `gradeReason` ("2 independent sources: PR #84, notes 14-Mar").
6. **Conflicts**: group by topicKey; for topics with ≥2 claims, Gemini labels each pair
   CONTRADICTS / SUPERSEDES / CONSISTENT, considering dates. SUPERSEDES is not a conflict
   (it's shown as evolution on the timeline).
7. **Gaps**: run the 12-item checklist (below); every unmet item → MISSING claim.
8. **Questions**: build ≤10 gap questions ranked by priority = risk weight × number of
   dependent claims; each has a rationale and linked evidence.

The 12-item handover checklist: purpose & current status · how to run/deploy · where
code/docs live · credentials & secrets owner · production accounts/access · open work
with owners · key decisions (last 90 days) · external dependencies/vendors · key contacts
· recurring problems & fixes · upcoming deadlines · who reviews/approves changes.

**LLM safety net**: every call goes through `src/lib/llm.ts`, which caches by hash in
`LlmCache`, retries with backoff, enforces a per-run budget, and validates output with zod.
If `GEMINI_API_KEY` is missing or a call fails, the run falls back to
`seed/pipeline-cache.json` with mode CACHED and the UI shows a small neutral notice.

**Role compilation** (`compileRoleView(versionId, role)`): select only claims whose
evidence chunks are all within `allowedAccess(role)`; everything else counts toward
`hiddenCount` and renders as "1 claim hidden — request access". The LLM writing the
overview and the 7/30-day plan receives ONLY the allowed claims and chunks. After
compiling, scan the output for every canary string found in non-allowed chunks; the
count must be 0 and is shown on the Trust page.

## Demo dataset: "FestFlow" (`seed/`)

FestFlow is the registration & ticketing web app of a college cultural-fest club.
Timeline Jan–Apr 2026. People: Meera Kulkarni (tech lead, graduating), Arjun Mehta
(incoming lead), Prof. S. Rao (faculty coordinator), Kabir Shah (frontend),
Sana Iyer (design), Dev Patil (treasurer). Sources are fixtures in the repo (not a real
GitHub repo), shaped exactly like real exports:

- `github/commits.json` (~60), `github/pulls.json` (12, with review comments),
  `github/issues.json` (15)
- `docs/README.md`, `docs/architecture.md`, `docs/meeting-notes/2026-02-10.md`,
  `2026-03-14.md`, `2026-04-02.md`
- `chat/discord-export.json` (~150 messages across #dev, #payments, #general)
- `tasks/trello-board.csv` (~25 cards)
- `restricted/budget-sponsors.csv` (RESTRICTED; contains canary `CANARY-RM-7F3A` and a
  sponsor phone number)

It MUST contain these story beats (they appear in our pitch deck):

- Auth moved from Firebase to Supabase on 12 Mar because the Firebase free tier hit limits
  during fest sign-ups (PR #84, chat 12-Mar, notes 14-Mar) → VERIFIED; earlier
  "we use Firebase" claims → SUPERSEDES (evolution, not conflict)
- Payment gateway: notes 02-Apr say "Final: go with Razorpay, lower setup fee"; chat
  #payments 19-Apr says "PhonePe trial creds came today, testing this week" → CONFLICT
- email-templates service: Meera is the only committer (23 commits) → INFERRED owner,
  SINGLE_OWNER risk
- "Build fails on Windows" appears 7 times across issues and chat → RECURRING
- No record of who holds the production database password → MISSING
- Sponsor contact moved to the alumni cell → only answerable via the gap interview
- A fake secret pasted in chat to prove redaction. Use a made-up prefix like
  `ffk_live_` + random chars. **Never use real provider key formats** (GitHub push
  protection will block the push).

`seed/ground-truth.json` lists the expected decisions, risks, conflicts, gaps and
canaries; the Trust page scores the pipeline against it. A one-time script
`npm run seed:pipeline` runs the live pipeline with Gemini and writes
`seed/pipeline-cache.json` (committed). `prisma db seed` loads fixtures + cache, so the
deployed app has full data with zero API calls. `POST /api/demo/reset` (and a
"Reset demo" button) restores everything.

## Pages

- `/`: landing with a 3D hero, pitch line, 3 USP cards, "Open live demo" → `/p/festflow`,
  "Start your own handover" → `/new`, "60-second tour"
- `/p/[slug]`: command centre dashboard
- `/p/[slug]/sources`: Connect + run the pipeline with a live 3D stepper
- `/p/[slug]/ledger`: Evidence Ledger with an evidence drawer
- `/p/[slug]/conflicts`: side-by-side resolution
- `/p/[slug]/interview`: gap-driven exit interview
- `/p/[slug]/review`: reviewer workspace, approve → immutable version, version diff
- `/p/[slug]/handover`: role-compiled successor view, acknowledgements, follow-ups, receipt
- `/p/[slug]/trust`: Trust report (quote validity, accuracy vs ground truth, canary
  leakage per role, redactions, audit log)
- `/new`: create-project wizard (upload files / GitHub URL)

## Design rules: professional, dense, NOT AI-looking

Think Linear, Vercel dashboard, Stripe, Sentry: a serious tool for real work.

Tokens (dark, matches the pitch deck):
- bg `#0B0D15`, surface `#11141F`, surface-2 `#171B28`, border `#252A3A`,
  text `#E8EAF2`, muted `#A9AEC2`, subtle `#6B7186`
- primary amber `#E8A33D` (use sparingly: primary actions, active nav, focus)
- grades: VERIFIED `#1F9E89`, SINGLE_SOURCE `#4C7BD9`, INFERRED `#E8A33D`,
  CONFLICTING `#E2574C`, MISSING `#8A8FA3`, testimony badge `#7A4FD1`
- Type: "Source Serif 4" for page titles only; "Inter" for UI (13–14px base);
  "JetBrains Mono" for quotes, IDs, locators and numbers; `tabular-nums` everywhere.
- 1px borders, radius 6–8px, 4px spacing grid, dense tables, compact rows.

Do:
- Fill every screen with real seeded data: counts, dates, names, sparklines. No empty
  panels; empty states always say what to do next with a button.
- Use domain-specific microcopy ("2 independent sources: PR #84, notes 14-Mar").
- Use skeletons for loading, inline errors with retry, keyboard focus states.
- Keep motion subtle (150–250ms) and respect `prefers-reduced-motion`.

Don't:
- No emoji, no ✨ sparkle icons, no "AI-powered" badges, no robot imagery.
- No purple/blue gradient text, no rainbow gradients, no glassmorphism on every card
  (at most one soft radial glow per page background).
- No giant centred marketing copy inside the app; no lorem ipsum; no placeholder avatars
  with initials only when a name exists (initials ARE fine as avatars).
- No generic card grids with 3 words each.

## Three.js rules

- Client components only, `dynamic(() => import(...), { ssr: false })`, Suspense fallback
  that matches the layout (no layout shift).
- Cap DPR at 1.75, pause rendering when off-screen, no post-processing heavier than a
  subtle bloom, keep GPU work light enough for a judge's laptop.
- Respect `prefers-reduced-motion` (render a static frame).
- 3D must *mean* something: sources → handover stack, pipeline staircase, evidence
  constellation. Never decorative blobs.

## Conventions

- Server Actions or route handlers for mutations; zod-validate every input.
- Business logic in `src/lib/*`, UI in `src/components/*`, pages thin.
- `npm run typecheck` and `npm run build` must pass before every commit.
- Health check: `GET /api/health` returns `{ ok: true, db: true }`.
