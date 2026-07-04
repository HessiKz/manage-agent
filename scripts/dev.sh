#!/usr/bin/env bash
# Lean dev stack: Postgres + Redis in Docker; API + Next on host (lower RAM than full compose).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BACKEND_PID=""
FRONTEND_PID=""
CURSOR_API_PID=""
DEV_PROXY_COMPOSE=(docker compose -f docker-compose.dev-proxy.yml)

cleanup() {
  echo ""
  echo "Stopping backend, frontend, and dev nginx…"
  [[ -n "$BACKEND_PID" ]] && kill "$BACKEND_PID" 2>/dev/null || true
  [[ -n "$FRONTEND_PID" ]] && kill "$FRONTEND_PID" 2>/dev/null || true
  [[ -n "$CURSOR_API_PID" ]] && kill "$CURSOR_API_PID" 2>/dev/null || true
  "${DEV_PROXY_COMPOSE[@]}" down 2>/dev/null || true
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

free_port() {
  local port="$1"
  if ss -tlnp 2>/dev/null | grep -q ":${port} "; then
    echo "▶ Freeing port ${port}…"
    fuser -k "${port}/tcp" 2>/dev/null || true
    sleep 1
  fi
}
free_port 8000
free_port 3000

# Hardened VPS often DROPs :8000/:3000; nginx on :80 still needs loopback to reach host dev servers.
if iptables -L INPUT -n 2>/dev/null | grep -q 'dpt:8000'; then
  if ! iptables -C INPUT -i lo -j ACCEPT 2>/dev/null; then
    echo "▶ Allowing loopback (iptables → nginx can reach host API/Next)…"
    iptables -I INPUT 1 -i lo -j ACCEPT
  fi
fi

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

echo "▶ Database migrations"
if [[ -x "$ROOT/backend/venv/bin/alembic" ]]; then
  (cd "$ROOT/backend" && ./venv/bin/alembic upgrade head)
elif command -v alembic >/dev/null 2>&1; then
  (cd "$ROOT/backend" && alembic upgrade head)
else
  echo "▷ alembic not found — run migrations manually: cd backend && alembic upgrade head"
fi

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

BIND_HOST="${DEV_BIND:-0.0.0.0}"
PUBLIC_URL="${PUBLIC_URL:-http://$(hostname -I | awk '{print $1}')}"

echo "▶ Backend  :8000 (reload, bind ${BIND_HOST})"
(cd "$ROOT/backend" && "$UVICORN" src.main:app --host "$BIND_HOST" --port 8000 --reload) &
BACKEND_PID=$!

export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1536}"
export INTERNAL_API_URL="${INTERNAL_API_URL:-http://127.0.0.1:8000}"
# Empty = same-origin /api/v1 (nginx :80 or Next rewrites on :3000).
# Never default to 127.0.0.1:8000 — remote browsers call the *client* loopback (status 0).
# Override only for local-only work: NEXT_PUBLIC_API_URL=http://127.0.0.1:8000 make dev
export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL-}"

echo "▶ Frontend :3000 (Turbopack, bind ${BIND_HOST})"
(cd "$ROOT/frontend" && npm run dev -- -H "$BIND_HOST") &
FRONTEND_PID=$!

echo "▶ Waiting for API/Next…"
TRIES=0
until curl -sf --max-time 5 "http://127.0.0.1:8000/health" >/dev/null 2>&1; do
  TRIES=$((TRIES + 1))
  if [[ $TRIES -gt 60 ]]; then
    echo "API did not become ready in time."
    exit 1
  fi
  sleep 1
done
TRIES=0
until ss -tlnp 2>/dev/null | grep -q ':3000 '; do
  TRIES=$((TRIES + 1))
  if [[ $TRIES -gt 60 ]]; then
    echo "Next did not bind port 3000 in time."
    exit 1
  fi
  sleep 1
done

echo "▶ Nginx :80 → host API/Next (public access)"
"${DEV_PROXY_COMPOSE[@]}" up -d nginx

echo ""
echo "  Public    ${PUBLIC_URL}"
echo "  Local     http://127.0.0.1:3000"
echo "  API docs  http://127.0.0.1:8000/docs"
echo "  Cursor API http://127.0.0.1:9191/api/v1 (toggle in Admin → ارائه‌دهنده مدل)"
echo "  DB/Redis  localhost:5432 / :6379 (Docker, left running on exit)"
echo ""
echo "Ctrl+C stops API + Next + dev nginx."

wait
