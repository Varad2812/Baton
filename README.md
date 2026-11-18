# Baton

**Hand over the project, not just the files.**

When a tech lead graduates or changes teams, the repository survives but the knowledge does not: why
auth moved, which decision was overturned, who holds the production password. Baton reads a project's
records (GitHub, Slack, chat exports, docs, PDFs, task boards), turns them into facts that each carry an
exact quote from their source, asks the person leaving only what the records cannot answer, and gives
the successor an approved, role-safe handover they can question.

**Live:** https://baton-qxyj.onrender.com · no login, no setup, no API key. The first open can take up
to a minute if the free server was asleep. Server health: [/status](https://baton-qxyj.onrender.com/status).

![Home](docs/screens/dashboard.png)

## Judge it in 60 seconds

1. Open the live link and pick **Take the 60-second tour** (9 steps, it switches persona for you), or
   **Explore the sample handover**, which opens the 8-step **Guide** (the "Guide 1/8" pill bottom-right
   reopens it any time; **Help** in the top bar has the tour, the guide and a glossary).
2. You get your own private copy of the sample project, FestFlow. Nothing you do affects other visitors;
   **Reset demo** restores your copy in about a second.
3. **Home** tells you who you are, your job and your one **Next step**. The sidebar follows the handover
   journey (1 Collect · 2 Understand · 3 Fill gaps · 4 Approve · 5 Hand over) and shows each persona its
   own pages first; everything else is under **More**.
4. The three Round 3 features: **Ask the handover**, **Knowledge at risk**, and **Sources → Add sources →
   Import from Slack → Use demo workspace (no login)** (then **Safety checks → Quotes & accuracy**).

| Persona (top bar, "Viewing as") | Role | Can do |
|---|---|---|
| Meera Kulkarni | Owner, departing tech lead | Connect sources and Slack, sync, answer the exit interview and follow-ups. Cannot approve her own handover. |
| Prof. S. Rao | Reviewer | Edit or reject facts, resolve conflicts, approve versions. |
| Arjun Mehta | Successor | Read and acknowledge the handover, ask it questions, send follow-ups. Restricted facts hidden unless granted. |
| Kabir Shah | Observer | Read-only, Public facts only. |

Every permission is checked on the server before any query or model call, never only in the UI.

## What it does

**Core (Rounds 1-2)**
- **Facts with receipts.** Every fact cites exact quotes; code (not the model) string-matches each quote
  in its source. Grades: Confirmed (2+ independent sources or one authoritative), Single source,
  AI inference, Conflicting, Missing.
- **Conflicts and evolution.** Disagreeing sources become side-by-side conflicts for a person to settle;
  "we moved from X to Y" is shown as evolution, not as a conflict.
- **Gap-driven exit interview.** A 12-item handover checklist; at most 10 questions ranked by risk. Answers
  become testimony, cited like any record.
- **Review and approve.** Immutable versions, no self-approval, blockers with override notes, version diffs.
- **Role-compiled handover.** Each role's view is compiled only from facts it may see; the writer model
  never receives hidden facts; every view is scanned for canary strings (0 leaks on Safety checks).

**New in Round 3**
- **Ask the handover** (`/p/<project>/ask`, and at the top of the handover). Questions are answered only
  from the approved handover your role may see. BM25 retrieval, every sentence cited, a validator drops
  any sentence with a missing or unknown citation or a quote that is not in the source, and a canary scan
  runs on every answer. Not in the records? "This isn't in the approved handover", and the successor can
  send it to the person leaving in one click; the answer becomes testimony and is then answerable.
- **Knowledge at risk** (`/p/<project>/radar`). Bus factor per code area, single-owner components,
  one-source decisions, chat-only decisions, secrets with no owner, stale tasks, and a knowledge-concentration
  score for every person, each with one action. Interactive 3D towers (drag, hover, click) with a static fallback.
- **Continuous handover.** Incremental GitHub sync (cursors + ETag, signed webhook), **Simulate new activity**
  on the sample, change detection against the approved version ("v1 is out of date: 5 new facts,
  1 contradiction…"), **Draft v2** showing only the changes, "What changed since v1" and a "v2 new" badge.
- **Slack connector.** Demo workspace (no Slack login), OAuth v2, or the official export ZIP; public
  channels → Team, private / DMs → Restricted; Open in Slack on every quote; re-sync by timestamp;
  Safety checks shows % Confirmed before and after Slack. See [docs/SLACK.md](docs/SLACK.md).
- **Per-visitor sandboxes, exports and sharing.** Your own copy of the demo; Markdown / JSON exports with
  citations; a signed read-only share link; PDF uploads (scanned PDFs get a clear error).
- **Help that knows its place.** Ask Baton explains how to use Baton and routes project questions to Ask the
  handover; **Smart Draft** next to text boxes writes from your notes (testimony only rephrases your own words).
- **Calm by design.** One job per page: a title, one sentence and one primary button; detail sits in tabs
  (Insights: Timeline · Evidence map 3D · Activity; Sources: All sources · Keep it current · Pipeline runs).

| | |
|---|---|
| ![Ask the handover](docs/screens/ask-the-handover.png) | ![Knowledge at risk](docs/screens/knowledge-at-risk.png) |
| ![Evidence drawer](docs/screens/evidence-drawer.png) | ![Safety checks](docs/screens/trust.png) |
| ![Add sources](docs/screens/add-sources.png) | ![Insights](docs/screens/insights.png) |

## Run it yourself in 10 minutes

Requires Node 20+ (22 recommended) and PostgreSQL 15+.

```bash
git clone https://github.com/Varad2812/Baton.git && cd Baton
docker compose up -d                      # local Postgres (or use any Postgres you have)
cp .env.example .env                      # set DATABASE_URL, e.g. postgresql://baton:baton@localhost:5432/baton
npm run setup                             # install, migrate, seed the sample project
npm run dev                               # http://localhost:3000
```

No API key is needed: the sample project is pre-analysed, and without a model the app uses the verified
cache, a rule-based extractor and an offline answer engine. Optional variables (all in `.env.example`):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (required) |
| `GROQ_API_KEY`, `GROQ_MODEL` | First AI engine (pipeline, Ask Baton, Ask the handover) |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Second AI engine; `LLM_DISABLED=1` turns Gemini off |
| `ADMIN_TOKEN` | Protects `GET /api/cron/cleanup`; also the fallback signing key |
| `ENCRYPTION_KEY` | Encrypts stored OAuth tokens and signs cookies (falls back to a key derived from `ADMIN_TOKEN`) |
| `GITHUB_TOKEN`, `GITHUB_WEBHOOK_SECRET` | Higher GitHub rate limits; webhook signature secret |
| `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET`, `SLACK_BOT_TOKEN` | Slack OAuth, events, demo workspace ([docs/SLACK.md](docs/SLACK.md)) |
| `NEXT_PUBLIC_APP_URL` | Public URL (OAuth redirect) |

Tests: `npm test` (unit), `npm run e2e`, `npm run qa`, `npm run judge`, or everything with
`npm run check` (local database only). Details in [docs/TESTING.md](docs/TESTING.md).

## Documentation

| | |
|---|---|
| [SUBMISSION.md](SUBMISSION.md) | Round 3 submission: features, what we promised vs built, tests, limitations |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Pipeline, data model, permissions, engines and fallbacks, sync (diagrams) |
| [docs/API.md](docs/API.md) | Every route and who may call it |
| [docs/SECURITY.md](docs/SECURITY.md) | Redaction, role compilation, canaries, token encryption, signatures, stored data |
| [docs/TESTING.md](docs/TESTING.md) | Suites, counts, coverage, how to run them |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Render blueprint and environment |
| [docs/SLACK.md](docs/SLACK.md) | Slack setup and behaviour |
| [ROADMAP.md](ROADMAP.md) · [CHANGELOG.md](CHANGELOG.md) · [CONTRIBUTING.md](CONTRIBUTING.md) | Next 3 months · history · how to contribute |

## Stack

Next.js 16 (App Router, TypeScript strict) · Tailwind CSS 4 · Prisma 7 + PostgreSQL · Groq / Gemini
(`@google/genai`) with zod-validated JSON and an offline fallback · three.js via react-three-fiber ·
Playwright + Vitest · one Render web service + Render Postgres (`render.yaml`).

## Data and AI disclosure

- FestFlow and every sample file are synthetic. The "secrets" in them are fake (`ffk_live_…`).
- Secrets, emails and phone numbers are redacted before anything is stored or sent to a model.
- In the product: Groq (`openai/gpt-oss-120b`) and Gemini (`gemini-3.5-flash`) extract facts, label
  conflicts, write the role-scoped overview and answer questions; every quote is verified by code.
- To build it: Claude Code (Anthropic) was used as a coding assistant.

## License

MIT, see [LICENSE](LICENSE).
