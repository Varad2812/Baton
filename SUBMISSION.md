# Baton: Round 3 submission

**Live:** https://baton-qxyj.onrender.com (no login, no setup, no key) · **Repo:** https://github.com/Varad2812/Baton ·
**Status page:** https://baton-qxyj.onrender.com/status

Baton turns a project's records into a checked handover: every fact carries an exact quote from its
source, the person leaving is asked only what the records cannot answer, and each successor gets an
approved, role-safe handover they can question.

## 1. Complete feature list (all working on the live site)

- Per-visitor private copy of the sample project (FestFlow); Reset demo restores your copy in about a second
- No-login personas (Owner, Reviewer, Successor, Observer) with every permission enforced on the server
- First-visit welcome (tour / explore / your own files), 9-step guided tour, 8-step Start here guide tracked in the database (a "Guide 2/8" pill that opens a drawer); Help menu with tour, guide and glossary
- Navigation grouped by the handover journey (1 Collect · 2 Understand · 3 Fill gaps · 4 Approve · 5 Hand over) with done/pending dots; each persona sees its own pages first, the rest under More
- Home: "You are X. Your job: …" with one role-aware Next step, the "Analysis complete" summary and three status tiles; Insights page (Timeline · Evidence map 3D · Activity)
- Sources: Add sources flow (Upload files · Import from GitHub · Import from Slack), uploads (.md .txt .csv .json chat exports .docx .pdf), public GitHub import, access labels, per-source grants; tabs All sources · Keep it current · Pipeline runs
- Slack: demo workspace import, Connect Slack (OAuth v2), Slack export ZIP (Sources and /new), channel picker with access override
- Pipeline: chunking, redaction before storage, extraction with verbatim quotes, quote validation, grading, conflicts vs supersessions, 12-item gap checklist, ranked questions; live 3D staircase; progress survives a refresh
- Engine chain Groq → Gemini → rule-based / verified cache, with cache and budgets
- Facts & evidence ledger with filters and the evidence drawer (quote highlighted in its source, Open in Slack)
- Conflicts: side by side, pick A / pick B / both / ask the owner
- Exit interview: answers become testimony and change grades
- Review & approve: edit, reject, section review, blockers with override note, immutable versions, version diff, Draft v2 with only the changes
- Successor handover: cover, overview, 7/30-day plan, sections with citations, acknowledgements, follow-ups, hidden-fact placeholders, receipt, PDF print, Markdown and JSON export, signed read-only share link
- **Ask the handover**: cited answers from the approved handover only, refusal with one-click Ask the owner, draft labelling
- **Knowledge at risk**: per-area and per-person risk, one action per finding, interactive 3D towers
- **Continuous handover**: incremental GitHub sync, signed webhook, Simulate new activity, out-of-date banner, "What changed since v1", "v2 new" badge
- Safety checks: quote validity, accuracy vs ground truth, leakage matrix (0), Q&A safety, Slack before/after, redactions, runs, audit log
- Ask Baton help assistant and Smart Draft (writes from your notes; separate from Ask the handover)
- `/new` wizard to build a handover from your own files, a Slack export or a GitHub repo
- `/status`, `/api/health`, scheduled cleanup, creator-only project deletion

## 2. Technical architecture and implementation

One Next.js 16 app (App Router, TypeScript strict) on one Render web service with Render PostgreSQL;
Prisma 7; Tailwind 4; three.js via react-three-fiber; Groq and Gemini behind one engine chain with
zod-validated JSON and offline fallbacks. Long work streams over SSE; no queue. Diagrams in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

- **Trust by construction:** quotes are validated by code (exact substring after normalisation); grades
  follow fixed rules; Ask the handover drops any uncited or misquoted sentence.
- **Access by construction:** a fact is visible only if every chunk it cites is visible to the role;
  role views, Q&A, exports, the assistant and share links are built from visible facts only; canary
  strings planted in restricted sources are scanned for on every compiled view and every answer.
- **Never broken without AI:** cache → Groq → Gemini → rules / offline at every model call.
- **Sandboxes:** a signed anonymous visitor cookie; the shared demo URL redirects to the visitor's own
  copy, cloned in one transaction with suffixed ids.
- **Incremental by design:** sources carry an `externalId`, items a stable key; a re-sync appends only
  unseen items through the same redaction path; a database lock allows one run per project.

## 3. Improvements completed after Round 2

### The three promised improvements

**A1. Ask the handover: grounded Q&A for the successor**
- *What we promised:* "Grounded Q&A on the approved handover, with the same quote receipts."
- *What we built:* `/p/<project>/ask` and an Ask box at the top of the handover. Retrieval only over the
  approved version's facts the persona may see (re-checked against current access) plus the excerpts they
  cite and testimony recorded after approval; BM25 with topic boosts, top 8 excerpts + matching facts.
  Answer contract: every sentence cites numbered sources; a server-side validator drops sentences with a
  missing or unknown citation or with quoted words not found in a cited source; canary + hidden-quote
  scan and redaction on every answer. "This isn't in the approved handover" (or "listed as a known gap")
  with one-click **Ask Meera** → follow-up → testimony → answerable. Draft answers labelled "Draft — not
  yet approved". Offline: top 3 exact quotes with one templated line. Citations open the evidence drawer;
  footer "Answered from N sources · engine". Trust shows Q&A safety. Ask Baton now says "How do I use
  Baton?" and routes project questions to Ask the handover.
- *Where to see it:* sidebar **Ask the handover** (as Arjun); tour step 7; **Safety checks → Q&A safety**.
- *How it was tested:* 17 unit tests (validator, refusals, offline answers, observer filtering with an
  echoing engine, canary); QA spec `05-ask` (6 tests: draft label, cited answer → drawer, refusal → Ask
  owner → testimony → answerable, observer gets only Public facts, bad input, Trust counts 100% / 0 leaks).

**A2. Knowledge-at-risk radar with continuous handover**
- *What we promised:* "Knowledge-at-risk radar that flags single-owner areas before anyone gives notice"
  and "incremental re-sync instead of full re-runs".
- *What we built:* `/p/<project>/radar`: bus factor per code area, single-owner components, one-source
  and chat-only decisions, secrets with no recorded owner, stale tasks, knowledge concentration for every
  person with "hand over first", one action per finding (adds an interview question or follow-up, deduplicated);
  interactive 3D towers (height = risk, colour = owner concentration, hover, click, drag, legend, static
  fallback, reduced motion). Incremental GitHub sync (since cursors + ETag; Sync now; signed webhook);
  change detection vs the approved version (new / contradicted / outdated / newly confirmed); banner
  "v1 is out of date: 5 new facts, 1 contradiction, 5 outdated facts, 1 newly confirmed"; **Draft v2**
  showing only the changes; "What changed since v1" and a "v2 new" badge for the successor. **Simulate new
  activity** (labelled simulated) injects 3 commits and 6 messages through the same incremental path.
- *Where to see it:* sidebar **Knowledge at risk**; **Sources → Keep it current → Simulate new activity**
  (as Meera, after approving v1 as Prof. Rao); Home banner; tour step 8.
- *How it was tested:* unit tests for change classification, risk scoring, webhook signatures; DB tests:
  simulated batch equals `seed/later-activity/expected.json`, reviewer edits preserved, second run adds
  nothing, GitHub delta re-sync with ETag 304; QA spec `06-continuous` (radar actions deduplicated;
  simulate → banner → Draft v2 → approve → successor sees changes and badge).

**A3. Live Slack connector with automatic permission mapping**
- *What we promised:* "Slack and Google Drive connectors" (Slack workspace import and Google Docs import from Drive).
- *What we built:* Connect Slack (OAuth v2, signed state + nonce cookie, tokens AES-256-GCM encrypted at
  rest, never sent to the browser), Import from demo Slack workspace (server-only token), and Slack export
  ZIP (Sources and /new); one importer for all three. Channel picker with members and visibility,
  history capped per channel, cursor pagination, Retry-After on 429; public → Team, private/DM →
  Restricted with owner override; "invite @Baton" guidance; users mapped into the identity map;
  Open in Slack on every quote; redaction before storage; re-sync since the last ts; events endpoint with
  v0 signatures. Trust shows % Confirmed before and after Slack.
- *Verified on the live site (2026-11-18):* **Import from demo Slack workspace** with no Slack login.
  #dev and #payment were mapped to Team, #leads-private to Restricted, and a secret pasted in chat was
  redacted before storage. After the live pipeline run the project went from **67 to 88 facts** and from
  **3 to 5 conflicts**.
- *Where to see it:* **Sources → Add sources → Import from Slack** (as Meera) → **Use demo workspace (no login)**
  (or the FestFlow sample export), then **Safety checks → Cross-source verification: Slack**. Setup:
  [docs/SLACK.md](docs/SLACK.md).
- *How it was tested:* 12 unit tests (encryption and tampering, permission mapping, message cleaning,
  ZIP parsing and bad uploads, pagination + Retry-After, OAuth state, signatures) + 1 DB test (sample
  export confirms 6 facts, idempotent re-import, 0 leaks); QA spec `07-slack` (2 tests).

### Also completed in Round 3

- Per-visitor sandboxes, private `/new` projects, cleanup (startup, hourly, admin cron)
- Role-aware Next step, "facts" wording, Start here tracked in the database, PDF uploads with page-numbered English OCR for short scans
- Reliability: in-flight guards, expected version on approve, upload dedupe, database run lock,
  progress across refresh, per-page error boundaries, fetch timeouts, JSON logs, `/api/health` + `/status`
- Usability: welcome modal, 9-step tour, screenshot sweep fixes
- Information architecture after first-user feedback ("too much on every page"): journey-grouped, role-focused navigation; one job per page (title, one sentence, at most one primary button, at most two columns, detail in tabs); a calm Home; Add sources as a full-page step flow with a readable sources table and a Columns menu; the Start here rail became a drawer; Tour and Glossary moved into Help; the Draft helper was renamed Smart Draft
- Exports (Markdown, JSON with citations and links) and a signed read-only share link
- Accessibility: axe reports 0 serious/critical issues on every page
- Docs: README, ARCHITECTURE, API, SECURITY, TESTING, DEPLOY, SLACK, CHANGELOG, ROADMAP, CONTRIBUTING, LICENSE; `npm run setup`; Docker Compose

## 4. Testing

| Suite | Count | Result (local, 2026-11-20) |
|---|---|---|
| Unit + local-DB integration (Vitest) | 292 tests, 33 files | 292 passed |
| End to end (Playwright) | 6 | 6 passed |
| QA, UI + SQL assertions (Playwright) | 28 tests, 8 files | 28 passed |
| Judge alone (Playwright + axe) | 12 tests, 9 files | 12 passed |
| Coverage (`src/lib`, measured 2026-11-20) | | 61.52% lines, 47.11% branches |

On 20 November 2026, deployed revision `34bcd1c` processed a fresh project containing the three wizard sample files and the image-only release checklist. The run badge reported two live Groq calls, and the pipeline produced a draft in 40.7 seconds. The image-only regression test checks the recovered text and its page citation.

**Judge-alone results against the live site** (https://baton-qxyj.onrender.com, commit `0c45016`, 2026-11-17): **12/12 passed** in 5.3 minutes, every test starting as a brand-new visitor.

- Accessibility: axe on `/`, `/new` and every project page and tab (including Insights and Add sources): 0 serious or critical violations (local, 2026-11-18).
- Load: 20 concurrent page requests, all 2xx (0.65 s locally; 30.2 s on the live free Render instance, where requests queue on one small CPU, but none failed).
- Bad input on every form (friendly 4xx, never 500), empty project, double clicks (one version, one
  resolution, one answer), refresh during a run (reconnects; a second run is refused), persona switch
  mid-flow, 390 px on every page, two visitors isolated.
- Details and how to run: [docs/TESTING.md](docs/TESTING.md).

## 5. Known limitations (honest)

- Team projects support revocable, single-browser reviewer and successor invitations. Organization SSO remains on the roadmap.
- **Handover templates for different settings (B4) not built.** The 12-item checklist is the same for
  every project.
- **Extra 3D (E) not built:** no approval animation, no sync glow or Slack node type in the constellation;
  Lighthouse not re-measured after Round 3 (Round 2: 100 on the landing page).
- **Connect Slack for other workspaces** needs the Slack app's public distribution switched on; the OAuth
  round trip is implemented and unit-tested but was not exercised against a second real workspace.
- **GitHub webhook** is implemented and signature-tested; `GITHUB_WEBHOOK_SECRET` is not set on the live site.
- **Simulated and sample Slack content use prepared extractions** on the sample project (like the FestFlow
  cache) so the demo is the same every time; quotes are still re-validated. Real syncs use the live engines.
- **docker-compose.yml was not executed** on the build machine (no Docker). The README path was otherwise
  verified on a fresh clone from GitHub with a local PostgreSQL: `npm run setup` (12 s) and `npm run dev`
  served the sample with no API keys.
- The live free instance is slow under load (20 concurrent page requests took 30 s; none failed) and sleeps when idle.
- Free Gemini quota is small, so live runs mostly use Groq or the rule-based extractor; the free Render
  instance sleeps (first request can take up to a minute).
- Redaction is pattern-based; unusual secret formats can be missed.
- Ask the handover's offline mode quotes records instead of summarising; with no model, ties between
  similar records can rank a less useful quote first.

## 6. Roadmap summary

Next 3 months ([ROADMAP.md](ROADMAP.md)): Month 1, sign-in, team invitation pilots and templates for 3 pilot
teams; Month 2, more Google Drive formats and a Notion connector, scheduled sync, Ask the handover in Slack, and a
150-question evaluation set (citation precision ≥ 95%, 0 leaks); Month 3, live radar alerts, successor
corrections, a hardened self-hosting guide and a pilot report on successor time-to-productivity.

## 7. Team roles

Finals responsibilities for this collaborative build:

- Varad Rathor owns the extraction pipeline, citation quality and release verification.
- Kartik Patil owns the successor experience, guided demo and usability walkthrough.
- Rohan Agasti owns connector demonstrations, permissions and test evidence.

## AI and tools disclosure

In the product: Groq (`openai/gpt-oss-120b`) and Gemini (`gemini-3.5-flash`) for extraction, conflict
labels, the role-scoped overview and answers; every quote is verified by code. To build it: Claude Code
(Anthropic) as a coding assistant.
