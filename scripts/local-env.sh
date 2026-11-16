# Source this before running anything against the LOCAL database:
#   source scripts/local-env.sh && npm run dev
# dotenv and Next never override variables that are already set, so .env's DATABASE_URL is ignored.
export DATABASE_URL="${LOCAL_DATABASE_URL:-postgresql://$(whoami)@localhost:5432/baton_dev}"
export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"
