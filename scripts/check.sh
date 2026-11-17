#!/usr/bin/env bash
# Full gate before every commit: typecheck, lint, unit tests, production build, e2e, QA (and the
# judge-alone suite when present), all against the LOCAL database and fully offline (no LLM calls).
#   bash scripts/check.sh            # everything
#   SKIP_BUILD=1 bash scripts/check.sh   # reuse .next
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/local-env.sh
export LLM_DISABLED=1 GROQ_API_KEY="" GEMINI_API_KEY=""
case "$DATABASE_URL" in *localhost*|*127.0.0.1*) ;; *) echo "Refusing to run: DATABASE_URL is not local"; exit 1;; esac

# Keep the Mac awake for the whole gate (a sleeping laptop shows up as test timeouts).
if command -v caffeinate >/dev/null; then caffeinate -dimsu -w $$ & fi

step() { printf '\n\033[1m== %s\033[0m\n' "$1"; }
step "prisma migrate deploy"; npx prisma migrate deploy >/dev/null
step "typecheck"; npm run -s typecheck
step "lint"; npm run -s lint
step "unit"; npx vitest run --reporter=dot
if [ -z "${SKIP_BUILD:-}" ]; then step "build"; npm run -s build >/dev/null; fi
step "e2e"; E2E_SKIP_BUILD=1 npx playwright test --reporter=dot

PORT=3200
step "start server on :$PORT for QA"
npx next start -p $PORT >/tmp/baton-check-server.log 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT
for i in $(seq 1 60); do curl -sf "http://localhost:$PORT/api/health" >/dev/null && break; sleep 1; done
step "qa"; QA_BASE_URL="http://localhost:$PORT" npx playwright test -c playwright.qa.config.ts --reporter=dot
if [ -f playwright.judge.config.ts ]; then step "judge"; JUDGE_BASE_URL="http://localhost:$PORT" npx playwright test -c playwright.judge.config.ts --reporter=dot; fi
step "ALL GREEN"
