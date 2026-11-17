# Deploy

Baton runs as one Render web service plus Render PostgreSQL, defined in `render.yaml` (Blueprint).

## Render (Blueprint)

1. Fork the repo, then in Render: **New → Blueprint** and pick it. Render creates `baton-db` (Postgres)
   and the `baton` web service (Singapore, Node 22).
2. Build: `npm ci && npx prisma generate && npx prisma migrate deploy && npm run build`.
   Start: `npm run db:ensure-seed && npm run start` (seeds the sample project on an empty database).
3. Health check: `/api/health`. Every push to `main` deploys automatically.
4. Set the secret environment variables (marked `sync: false` in the blueprint):

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Wired from `baton-db` by the blueprint |
| `ADMIN_TOKEN` | yes | Long random string; protects `/api/cron/cleanup`, fallback signing key |
| `NEXT_PUBLIC_APP_URL` | yes | e.g. `https://baton-qxyj.onrender.com` (Slack redirect URL) |
| `ENCRYPTION_KEY` | recommended | Long random string; changing it signs visitors out of their demo copies |
| `GROQ_API_KEY`, `GROQ_MODEL` | optional | First AI engine (`openai/gpt-oss-120b`) |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | optional | Second AI engine (`gemini-3.5-flash`) |
| `GITHUB_TOKEN` | optional | Raises the GitHub API limit from 60 to 5,000 requests/hour |
| `GITHUB_WEBHOOK_SECRET` | optional | Enables `POST /api/webhooks/github` |
| `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET` | optional | Connect Slack (OAuth) and events |
| `SLACK_BOT_TOKEN` | optional | Pre-connected demo workspace |

Without any optional keys the app is fully usable: the sample is pre-analysed, new projects use the
rule-based extractor, and Ask the handover answers with exact quotes.

## Operations

- **Status:** `/status` (human) and `/api/health` (JSON: db, engines, Slack, GitHub, version = git commit).
- **Cleanup:** expired visitor copies are deleted at start-up and hourly. External cron (optional):
  `curl -H "Authorization: Bearer $ADMIN_TOKEN" https://<app>/api/cron/cleanup`.
- **Logs:** one JSON object per line (`level`, `msg`, `at`, fields).
- **Migrations** are additive and run in the build step; the old instance keeps serving until the new one is healthy.
- **Free plan:** the service sleeps after inactivity; the first request can take up to a minute.

## GitHub webhook (optional)

Repository → Settings → Webhooks → Payload URL `https://<app>/api/webhooks/github`, content type
`application/json`, secret = `GITHUB_WEBHOOK_SECRET`, events: pushes, pull requests, issues, issue
comments. Every project that imported the repo syncs incrementally.

## Slack (optional)

See [SLACK.md](SLACK.md).
