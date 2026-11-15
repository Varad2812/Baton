# QA report

Run against a production build (`npm run build`, `LLM_DISABLED=1 PORT=3000 npm start`) on the real Postgres from `.env`.
No Gemini calls. Two live Groq runs (the `/new` sample project, `openai/gpt-oss-120b`, 1 call each, 13.6 s and 9.7 s,
34 and 19 claims at 40 / 17 valid quotes); every other `/new` run used the rule-based extractor.
Demo reset before and after; extra projects deleted (only `festflow` remains). Specs: `tests/qa/*.spec.ts`, run with `npm run qa`.
Every check asserts on the DB (pg) as well as the UI.

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Landing stats come from the DB | PASS | Sources, Claims (non-rejected), verified count, quote count and 0 leaks equal SQL counts |
| 2 | "Open live demo", "Start your own handover", "60-second tour" links | PASS | land on `/p/festflow`, `/new`, `?tour=1` |
| 3 | Persona switch changes visible claims | PASS | Owner/Reviewer = all claims; Incoming < total (2 restricted hidden); Observer < Incoming and ≥ PUBLIC count; hidden notice in sidebar and header |
| 4 | Hidden claim drawer shows a placeholder, not content | PASS | "1 claim hidden — request access from owner"; claim title absent from page |
| 5 | Ledger filters change counts | PASS | `grade=VERIFIED`, `+type=DECISION`, `q=Supabase` counts equal SQL counts; rail click sets the URL |
| 6 | Drawer highlights the stored quote in its chunk | PASS | `<mark>` text equals a stored quote for `clm_auth_supabase`, "exact match" badge |
| 7 | Contradicting evidence shown | PASS | payment claim drawer shows "Contradicted", the partner claim and its highlighted quote |
| 8 | Conflicts: Pick A re-grades both claims | PASS | cf_payment RESOLVED/A; winner no longer CONFLICTING; loser REJECTED; audit row; open count 3→2 |
| 9 | Conflicts: Ask leaver creates a gap question | PASS | Seeded conflicts already have a question (reused by design). With it deleted, Ask creates exactly one; a second click does not duplicate |
| 10 | Gap interview: answer → testimony + grade change | PASS | TESTIMONY source +1, claim MISSING→SINGLE_SOURCE, valid testimony quote stored; non-owner gets no box and API 403 |
| 11 | Review: edit | PASS | status EDITED, title/note saved, audit row |
| 12 | Review: reject / restore | PASS | REJECTED then restored |
| 13 | Review: mark section reviewed | PASS | `section.reviewed` audit +1, button flips to "Reviewed" |
| 14 | Approval blocked with open conflicts; no self-approval | PASS | dialog "blocked by N items", button disabled without checkbox+note; direct API without override 409; Owner API 403; 0 versions created |
| 15 | Override with note creates version | PASS | 1 HandoverVersion with note, `approvedAt`, 4 RoleViews, handover APPROVED v1 |
| 16 | Version diff shows changes | FAIL→FIXED | After approval every claim showed as "changed" (DRAFT→APPROVED bookkeeping). Fixed in `src/lib/handover/diff.ts` (only rejected↔live is a status change) + unit test. Now exactly "1 changed", v1 snapshot immutable |
| 17 | Handover renders the approved RoleView per persona | PASS | all 4 personas see "v1 approved by Prof. S. Rao"; stored `hiddenCount` 0/0/>0/more; canary never on page |
| 18 | Acknowledge | PASS | 2 Acknowledgement rows; Observer API 403 |
| 19 | Request access logs audit | PASS | `access.requested` +1, placeholder shows "Requested from …" |
| 20 | Follow-up reaches leaver; answer becomes testimony | PASS | FollowUp row, Meera answers, TESTIMONY source +1, answer visible to Arjun |
| 21 | Receipt | PASS | ack times for acknowledged sections, "—" for others, hash and override note |
| 22 | Trust: re-check quotes | PASS | audit row, valid = total (127/127) |
| 23 | Trust: leakage test shows 0 leaks | PASS | audit row; all 4 matrix rows 0; Incoming/Observer rows withheld chunks (>0) so the test is meaningful |
| 24 | Sources: grant to successor | PASS | `grantedToIncoming` true, Arjun's visible claims increase, Observer still sees no canary |
| 25 | Sources: access label change | PASS | chunks inherit RESTRICTED, claims re-labelled, Arjun's count drops; Reviewer PATCH 403 |
| 26 | Sidebar counts equal page counts | PASS | Sources, Ledger, Conflicts, Interview for 3 personas; Review, Handover, Trust vs DB and page |
| 27 | Reset demo restores the seed exactly | PASS | deep snapshot (counts, grades×status, conflicts, source access/grants, gap answers, md5 of claim text, handover) equal after dirtying + UI reset |
| 28 | `/new` samples complete with claims | PASS | Groq: 19 claims, 17 valid quotes, 0 invalid, 6 questions, 2 redactions, 0 raw secrets; rule-based: 20 claims, 9 valid quotes; no VERIFIED claim without a matched quote |
| 29 | New project pages free of sample names | FAIL→FIXED | 4 personas × 9 pages scanned for Meera, Arjun, Kabir, Rao, FestFlow, Razorpay, Kalrav, Zenith, "fest", Jan–May. Found: Observer persona still "Kabir Shah" (fixed in `authz.ts`: unmapped personas are "Observer"), "FestFlow" in Trust empty state (reworded + button) |
| 30 | Hardcoded "Ask Meera" | FAIL→FIXED | dashboard attention action now `Ask <handover owner first name>` |
| 31 | Timeline axis / "fest" marker on new projects | FAIL→FIXED | axis derived from the project's own records (Sep 2026–Nov 2026 for the sample), "fest" marker only on festflow; sparkline start also data-driven |
| 32 | Knowledge-at-risk empty state | FAIL→FIXED | "No commit history in the connected sources…" with "Connect a repo" button |
| 33 | Run badge cut off | FAIL→FIXED | badge moved out of the truncating card description onto its own wrapping row; asserted not clipped |
| 34 | Tour: all 7 steps anchored | PASS | each step `data-state=anchored` with a real bounding box; completion stored |
| 35 | No console errors, no 4xx/5xx | PASS | `/`, `/new` and 10 project pages × 4 personas; unknown project is a clean 404 |
| 36 | 390 px no horizontal scroll | PASS | `/`, dashboard, ledger, `/new` |

## Suites
- `npm run qa`: 16/16 · `npm test`: 175/175 · `npm run e2e`: 3/3 · `npm run build` and `npm run typecheck` clean.

## Observations (not changed)
- Ledger route shows the dashboard-shaped skeleton while loading.
- Dashboard constellation legend is a 3D-component detail owned by the `ui` branch.
