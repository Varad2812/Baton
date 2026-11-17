# Testing

Five suites, all offline (no model calls: `LLM_DISABLED=1`, no Groq key, fakes for engines and HTTP).
Numbers below are from the last full run of `npm run check` on 2026-11-17.

| Suite | Command | Count | Runs against |
|---|---|---|---|
| Unit + local-DB integration (Vitest) | `npm test` | **267 tests in 29 files** | code; DB tests use the local database and skip elsewhere |
| End to end (Playwright) | `npm run e2e` | **5 tests** | builds and starts `next start -p 3100` itself |
| QA (Playwright + SQL assertions) | `npm run qa` | **27 tests in 8 files** | a running server (`QA_BASE_URL`, default :3000) |
| Judge alone (Playwright + axe) | `npm run judge` | **12 tests in 9 files** | any server, including production (`JUDGE_BASE_URL`) |
| Everything | `npm run check` | typecheck, lint, unit, build, e2e, QA, judge | refuses to run unless `DATABASE_URL` is local |

Coverage (`npm run coverage`, `src/lib/**`): **58.6% lines, 80.8% branches, 69.4% functions**. UI code is
covered by the Playwright suites, not by this number.

## Running it

```bash
source scripts/local-env.sh     # points DATABASE_URL at a local Postgres (never the production DB)
npm run check                   # ~4 minutes; keeps the Mac awake with caffeinate
```

Or one suite at a time:

```bash
npm test
npm run build && LLM_DISABLED=1 PORT=3200 npm start      # in another terminal
QA_BASE_URL=http://localhost:3200 npm run qa
JUDGE_BASE_URL=http://localhost:3200 npm run judge
JUDGE_BASE_URL=https://baton-qxyj.onrender.com npm run judge   # production, as a first-time visitor
```

QA and e2e use a fixed, signed test visitor (`tests/visitor.ts`), so all their pages and SQL checks work on
one known private copy of the sample. The judge suite starts every test as a brand-new visitor, exactly
like a judge, so it can run against production without touching anyone else's data.

## What each suite covers

**Unit / integration (Vitest)**
- Permission matrix and access rules (59): every role × action, granted sources, hidden facts.
- Pipeline: chunking, redaction, quote validation, grading, conflicts, gaps, questions, preservation on
  re-run, rule-based fallback, ingest (files, PDF incl. scanned PDFs, GitHub with fake fetch), testimony, scoring.
- Role compilation: Successor and Observer never see `CANARY-RM-7F3A`, even with an echoing or adversarial writer.
- Ask the handover (17): BM25 ranking, citation validator (uncited, unknown, misquoted), refusals (not
  found, known gap), offline extractive answers, draft labelling, canary refusal, observer cannot be shown
  Team/Restricted text.
- Continuous handover: change classification (new, contradicted, outdated, confirmed; viewer filter),
  risk scoring, GitHub webhook signatures; DB tests: the simulated batch matches
  `seed/later-activity/expected.json`, keeps reviewer edits, a second run adds nothing; GitHub delta with
  ETag 304; cleanup never deletes the template.
- Slack (13): AES-GCM token encryption and tampering, visibility → access mapping, message cleaning and
  permalinks, export ZIP parsing and bad uploads, pagination with Retry-After, OAuth state (tampered,
  expired, other tab, other visitor), v0 signatures; DB test: the sample export confirms 6 facts, is
  idempotent and leaks 0 canaries.
- Ask Baton (39), next step per role, version diff, approval gates, share links.

**E2E:** full workflow (interview → resolve → approve with override → acknowledge → follow-up → reset),
`/new` with sample files offline, the 9-step tour, Ask Baton offline answers, Smart Draft.

**QA (UI + database):** landing numbers equal SQL counts; persona filtering; ledger filters and quote
highlighting; conflicts, interview, review, approval, version diff, handover, acknowledgements,
follow-ups, receipt; leakage test; access labels and grants; reset restores the seed exactly; `/new`
leaks no sample names; no console errors on any page × persona; 390 px; tour; Ask the handover (draft,
cited answer → drawer, refusal → Ask owner → testimony → answerable, observer filtering, bad input,
Trust counts); radar and simulate → banner → Draft v2 → approve → successor sees changes and badge;
Slack sample export with mapped access and Trust before/after; exports.

**Judge alone:** bad input on every form (UI messages and server 4xx, never 500), an empty project on
every page, double clicks on resolve / approve / ask owner / answer / reset, refresh and back during a
pipeline run plus a concurrent run, persona switch mid-flow, every page at 390 px, axe on every page
(**0 serious or critical**), 20 concurrent requests (**~0.65 s locally**), two visitors isolated, the
first-visit welcome.

## Results log

| Date | Where | Unit | e2e | QA | Judge |
|---|---|---|---|---|---|
| 2026-11-17 | local (Postgres 17, production build) | 267/267 | 5/5 | 27/27 | 12/12 |
| 2026-11-17 | live site, commit `0c45016` | – | – | – | 12/12 (5.3 min; 20 concurrent requests in 30.2 s, 0 errors) |

Fresh clone from GitHub + `npm run setup` + `npm run dev` with no keys: health, sandbox redirect and pages OK (2026-11-17).
