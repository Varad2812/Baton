# Contributing

Thanks for helping. Baton is small on purpose: one Next.js app, one Postgres database.

## Setup

```bash
docker compose up -d && cp .env.example .env   # DATABASE_URL=postgresql://baton:baton@localhost:5432/baton
npm run setup && npm run dev
```

## Rules of the codebase

- **Permissions on the server.** Every route handler and server action resolves the project with
  `resolveProject` / `projectBySlug` and checks the persona with `assertCan` before any query or model
  call. Never rely on the UI hiding a button.
- **No fact without a receipt.** Quotes are validated by code (`src/lib/pipeline/quotes.ts`); never show
  model output as Confirmed without a matched quote.
- **Redact before storage.** New ingest paths must go through `normaliseSources` / `appendRawSources`.
- **Every model call has a fallback** (cache, rules or offline) and a zod schema.
- **Every mutation writes an `AuditLog` row** and is safe to repeat (double clicks, retries).
- Business logic in `src/lib/*`, UI in `src/components/*`, pages thin. Follow the design rules in
  `CLAUDE.md` (dense, professional, no emoji, contrast ≥ 4.5:1).

## Before you open a pull request

```bash
source scripts/local-env.sh && npm run check   # typecheck, lint, unit, build, e2e, QA, judge
```

Add tests with the change: unit tests next to the code (`*.test.ts`), a QA or judge spec for anything a
person clicks. Migrations must be additive (the old version keeps serving during a deploy).

## Reporting a security issue

Please do not open a public issue; email the maintainers listed in SUBMISSION.md.
