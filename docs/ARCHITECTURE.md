# Architecture

One Next.js 16 app (App Router, route handlers, server actions) on one Render web service, with Render
PostgreSQL. No queue and no cache server: long work streams over SSE from a route handler, and
everything is in Postgres. Business logic lives in `src/lib/*`, UI in `src/components/*`, pages are thin.

## Request path

```mermaid
flowchart LR
  B[Browser] -->|every request| PX[src/proxy.ts<br/>signed visitor cookie]
  PX -->|/p/festflow → /p/festflow-key| PG[Pages / server actions / route handlers]
  PG --> RP[resolveProject<br/>src/lib/sandbox.ts]
  RP -->|template → visitor copy<br/>others' projects → 404| DB[(PostgreSQL)]
  PG --> AZ[getActor + can / assertCan<br/>src/lib/authz.ts]
  AZ --> LIB[src/lib/* services]
  LIB --> DB
  LIB --> LLM[Engine chain<br/>Groq → Gemini → offline / rules]
```

- **Visitor identity** (`src/lib/visitor.ts`): an HMAC-signed anonymous cookie. The proxy forwards the
  verified id upstream and redirects the shared demo URL to the visitor's private copy.
- **Sandboxes** (`src/lib/sandbox.ts`): the first request clones the FestFlow template in one
  transaction with id suffixes (`clm_auth_supabase~<key>`). Copies expire 24 h after last use; projects
  made in `/new` belong to their creator and expire after 7 days idle. Cleanup runs at start-up, hourly,
  and on `GET /api/cron/cleanup`.
- **Personas** (`getActor`): the "Viewing as" cookie picks the role; every service call does `assertCan`
  before any query or model call.

## Pipeline

```mermaid
flowchart LR
  I[Ingest<br/>files · PDF · GitHub · Slack · ZIP] --> N[Normalise<br/>chunk ~800 chars, locators,<br/>identity map, REDACT]
  N --> E[Extract<br/>JSON schema, verbatim quotes]
  E --> V[Validate quotes<br/>exact substring, drop invalid]
  V --> G[Grade]
  G --> C[Conflicts<br/>contradicts / supersedes]
  C --> K[Gaps<br/>12-item checklist]
  K --> Q[Questions ≤10<br/>risk × dependents]
  Q --> R[Review & approve<br/>immutable version]
  R --> RC[Role compile<br/>allowed facts only + canary scan]
```

- `src/lib/pipeline/run.ts` runs all stages for a project and streams `{stage,status,counts,ms}` over SSE;
  each finished stage is also written to the run row so a refreshed page can follow it.
- `src/lib/pipeline/incremental.ts` runs the same stages on new chunks only (sync, webhook, Slack,
  simulated activity) and persists a delta: new facts, new evidence on existing facts, new conflicts.
  Reviewer edits, rejections, testimony and resolutions are never rewritten.
- One run per project at a time: a partial unique index on `PipelineRun(projectId) WHERE status='RUNNING'`,
  with stale runs (5 min) failed by the app.

## Engines and fallbacks

```mermaid
flowchart TD
  Q[Model call] --> C{LlmCache hit?}
  C -->|yes| OUT[zod-validated result]
  C -->|no| GQ{Groq configured<br/>and not rate limited?}
  GQ -->|ok| OUT
  GQ -->|fail / 429 / timeout| GM{Gemini configured?}
  GM -->|ok| OUT
  GM -->|fail| FB[Fallback]
  FB -->|sample project pipeline| CACHE[Verified cache<br/>seed/pipeline-cache.json]
  FB -->|other projects| RULES[Rule-based extractor<br/>quotes still validated]
  FB -->|Ask Baton / Ask the handover| OFF[Offline engine<br/>FAQ / exact quotes]
```

Budgets: per-run call budget, 15-20 s timeouts, no retries on 429 (the engine is benched for a minute),
per-IP limits for chat and Q&A. The demo never depends on a live model.

## Ask the handover

```mermaid
flowchart LR
  QQ[Question] --> CO[Corpus: role view of approved vN<br/>+ visible excerpts + later testimony]
  CO --> BM[BM25 + topic boosts<br/>top 8 excerpts + facts]
  BM -->|known gap / no match| REF[Refusal + Ask owner]
  BM --> EN[Engine chain or<br/>extractive quotes]
  EN --> VA[Citation validator<br/>drop uncited / unknown / misquoted]
  VA --> SC[Canary + hidden-quote scan<br/>redaction]
  SC --> ANS[Cited answer]
```

## Continuous handover

```mermaid
sequenceDiagram
  participant S as Source (GitHub / Slack / simulated)
  participant B as Baton
  participant R as Reviewer
  participant A as Successor
  S->>B: Sync now / webhook (only items after the cursor)
  B->>B: append chunks (redacted), extract new facts, link conflicts, regrade
  B->>R: "v1 is out of date: N new facts, 1 contradiction"
  R->>B: Draft v2 (only the changes) → approve
  B->>A: "v2 new" badge, "What changed since v1"
```

## Data model (main tables)

```mermaid
erDiagram
  Project ||--o{ Person : has
  Project ||--o{ Source : has
  Source ||--o{ Chunk : "split into"
  Chunk ||--o{ Redaction : "had removed"
  Project ||--o{ Claim : has
  Claim ||--o{ Evidence : "cited by"
  Evidence }o--|| Chunk : quotes
  Project ||--o{ Conflict : has
  Project ||--o{ GapQuestion : has
  Project ||--o{ Handover : has
  Handover ||--o{ HandoverVersion : "approved as"
  HandoverVersion ||--o{ RoleView : "compiled per role"
  HandoverVersion ||--o{ Acknowledgement : has
  Handover ||--o{ FollowUp : has
  Project ||--o{ PipelineRun : has
  Project ||--o{ SyncState : "sync cursors"
  Project ||--o{ AuditLog : "every mutation"
```

Also: `LlmCache` (model answers by hash), `Connection` (Slack OAuth tokens, encrypted). `Project.kind`
is TEMPLATE / SANDBOX / STANDARD; `Source.externalId` + item keys make re-syncs idempotent; `Chunk.meta`
keeps per-message links (Slack permalinks).

## Permission model

| Action | Owner | Reviewer | Successor | Observer |
|---|---|---|---|---|
| Connect / label / sync sources, Slack | ✓ | – | – | – |
| See Restricted facts | ✓ | ✓ | only granted sources | – |
| See Team facts | ✓ | ✓ | ✓ | – |
| Edit / reject facts, resolve conflicts | ✓ | ✓ | – | – |
| Answer interview and follow-ups | ✓ | – | – | – |
| Approve a version | – (no self-approval) | ✓ | – | – |
| Acknowledge, follow-ups, Ask owner | – | – | ✓ | – |
| Ask the handover | ✓ | ✓ | ✓ | ✓ (Public only) |

A fact is visible only if every chunk it cites is visible to the role. Hidden facts never leave the
server; only their count does.
