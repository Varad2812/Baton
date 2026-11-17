#!/usr/bin/env bash
# One-command setup for a fresh clone: install, migrate, seed the sample project.
# Needs a PostgreSQL URL in DATABASE_URL (from .env or the environment). No API keys are needed.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ ! -f .env ]; then cp .env.example .env; echo "Created .env from .env.example"; fi
set -a; source .env; set +a
if [ -z "${DATABASE_URL:-}" ] || [[ "$DATABASE_URL" == *"user:password@"* ]]; then
  echo "Set DATABASE_URL in .env first, e.g. postgresql://baton:baton@localhost:5432/baton (docker compose up -d)"; exit 1
fi
echo "== install"; npm install --no-audit --no-fund
echo "== migrate"; npx prisma migrate deploy
echo "== seed (sample project FestFlow + pipeline cache)"; npx prisma db seed
echo
echo "Ready. Start it with: npm run dev   (http://localhost:3000)"
echo "Optional keys in .env: GROQ_API_KEY / GEMINI_API_KEY (live AI), SLACK_* (Slack), GITHUB_TOKEN."
