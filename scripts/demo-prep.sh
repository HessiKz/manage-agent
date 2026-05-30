#!/usr/bin/env bash
# Reset DB to a clean demo catalog for supervisor presentation.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "▶ Starting Postgres + Redis"
docker compose up -d postgres redis

echo "▶ Waiting for Postgres…"
TRIES=0
until docker compose exec -T postgres pg_isready -U "${POSTGRES_USER:-admin}" -d "${POSTGRES_DB:-manage_agent}" >/dev/null 2>&1; do
  TRIES=$((TRIES + 1))
  [[ $TRIES -gt 60 ]] && { echo "Postgres timeout"; exit 1; }
  sleep 1
done

run_backend() {
  if docker compose ps backend --status running -q 2>/dev/null | grep -q .; then
    docker compose exec -T backend "$@"
  else
    docker compose run --rm backend "$@"
  fi
}

echo "▶ Migrations"
run_backend alembic upgrade head

echo "▶ Seed catalog (wipes test agents)"
run_backend python -m src.database.seed --reset-agents

echo "▶ Storage directories"
mkdir -p backend/var/agent_files backend/var/demo_reports backend/var/karkard_output
chmod -R a+rwX backend/var 2>/dev/null || true

if [[ -x backend/scripts/verify_agents.py ]]; then
  echo "▶ Verify catalog agents"
  (cd backend && ./venv/bin/python scripts/verify_agents.py 2>/dev/null) \
    || run_backend python scripts/verify_agents.py \
    || echo "  (verify skipped — run manually after backend is up)"
fi

cat <<'EOF'

✅ Demo database ready.

Login:  admin@example.com / admin123
App:    http://localhost:3000

Suggested demo path (see DEMO.md):
  1. Dashboard → quick prompt routing
  2. /agents/example-karkard → admin test + download
  3. /agents/example-supervisor → delegation
  4. /admin → platform overview

Requires OPENAI_API_KEY + OPENAI_BASE_URL in backend/.env for live LLM.

EOF
