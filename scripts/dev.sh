#!/usr/bin/env bash
# Lean dev stack: Postgres + Redis in Docker; API + Next on host (lower RAM than full compose).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BACKEND_PID=""
FRONTEND_PID=""
CURSOR_API_PID=""

cleanup() {
  echo ""
  echo "Stopping backend and frontend…"
  [[ -n "$BACKEND_PID" ]] && kill "$BACKEND_PID" 2>/dev/null || true
  [[ -n "$FRONTEND_PID" ]] && kill "$FRONTEND_PID" 2>/dev/null || true
  [[ -n "$CURSOR_API_PID" ]] && kill "$CURSOR_API_PID" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

for f in backend/.env frontend/.env; do
  if [[ ! -f "$ROOT/$f" ]]; then
    echo "Missing $f — run: cp ${f}.example $f"
    exit 1
  fi
done

echo "▶ Docker: postgres + redis"
docker compose up -d postgres redis

echo "▶ Waiting for Postgres…"
TRIES=0
until docker compose exec -T postgres pg_isready -U "${POSTGRES_USER:-admin}" -d "${POSTGRES_DB:-manage_agent}" >/dev/null 2>&1; do
  TRIES=$((TRIES + 1))
  if [[ $TRIES -gt 60 ]]; then
    echo "Postgres did not become ready in time."
    exit 1
  fi
  sleep 1
done

if [[ -x "$ROOT/backend/venv/bin/uvicorn" ]]; then
  UVICORN="$ROOT/backend/venv/bin/uvicorn"
elif command -v uvicorn >/dev/null 2>&1; then
  UVICORN="uvicorn"
else
  echo "No uvicorn found. Create a venv: cd backend && python -m venv venv && ./venv/bin/pip install -e ."
  exit 1
fi

if [[ ! -d "$ROOT/frontend/node_modules" ]]; then
  echo "▶ Installing frontend dependencies (first run)…"
  (cd "$ROOT/frontend" && npm install --legacy-peer-deps)
fi

CURSOR_VENV="$ROOT/cursor-to-api/.venv/bin/python"
if [[ -x "$CURSOR_VENV" ]]; then
  if curl -sf http://127.0.0.1:9191/api/v1/health >/dev/null 2>&1; then
    echo "▶ cursor-to-api :9191 (already running)"
  else
    echo "▶ cursor-to-api :9191"
    (cd "$ROOT/cursor-to-api" && "$CURSOR_VENV" -m cursor_to_api.main) &
    CURSOR_API_PID=$!
    sleep 1
  fi
else
  echo "▷ cursor-to-api skipped (no venv — cd cursor-to-api && python -m venv .venv && pip install -r requirements.txt)"
fi

echo "▶ Backend  :8000 (reload)"
(cd "$ROOT/backend" && "$UVICORN" src.main:app --host 127.0.0.1 --port 8000 --reload) &
BACKEND_PID=$!

export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1536}"
export INTERNAL_API_URL="${INTERNAL_API_URL:-http://127.0.0.1:8000}"

echo "▶ Frontend :3000 (Turbopack, heap cap 1.5GB)"
(cd "$ROOT/frontend" && npm run dev) &
FRONTEND_PID=$!

echo ""
echo "  App       http://127.0.0.1:3000"
echo "  API       http://127.0.0.1:8000/docs"
echo "  Cursor API http://127.0.0.1:9191/api/v1 (toggle in Admin → ارائه‌دهنده مدل)"
echo "  DB/Redis  localhost:5432 / :6379 (Docker, left running on exit)"
echo ""
echo "Ctrl+C stops API + Next only."

wait
