# Baton

Hand over the project, not just the files.

Baton rebuilds a project's live state from authorised sources, grades every claim against an
exact quoted source span, asks the departing person only what the records can't answer, and
gives each successor an approved, role-safe continuation plan.

## Run locally

```bash
cp .env.example .env        # set DATABASE_URL to a Postgres instance
npm install
npm run db:deploy           # apply migrations
npm run db:seed
npm run dev
```

Health check: `GET /api/health` returns `{ "ok": true, "db": true }`.

## Deploy

Render Blueprint (`render.yaml`): one Node web service plus one free Postgres database.
See `CLAUDE.md` for the full product spec and `PROGRESS.md` for current status.
