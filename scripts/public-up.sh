#!/usr/bin/env bash
# Always-on public access for HR / external users (Docker + nginx on :80).
# Unlike `make dev`, this survives SSH disconnect and reboot (restart: unless-stopped).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

log() { printf '▶ %s\n' "$*"; }

if [[ ! -f .env ]]; then
  echo "Missing .env — copy from .env.example and set PUBLIC_URL=http://YOUR_IP"
  exit 1
fi

log "Stopping host dev servers on :8000 / :3000 (if any)…"
fuser -k 8000/tcp 3000/tcp 2>/dev/null || true
sleep 1

FRONTEND_UID="$(id -u ubuntu24 2>/dev/null || echo 1000)"
FRONTEND_GID="$(id -g ubuntu24 2>/dev/null || echo 1000)"
if [[ -d "$ROOT/frontend/.next" ]]; then
  log "Fixing frontend/.next permissions (avoids Turbopack EACCES)…"
  chown -R "${FRONTEND_UID}:${FRONTEND_GID}" "$ROOT/frontend/.next" 2>/dev/null || true
fi

log "Starting postgres, redis, backend, frontend, nginx…"
docker compose up -d postgres redis
docker compose up -d --force-recreate backend frontend nginx 2>/dev/null || docker compose up -d backend frontend nginx

TRIES=0
until curl -sf --max-time 5 http://127.0.0.1/health >/dev/null 2>&1; do
  TRIES=$((TRIES + 1))
  if [[ $TRIES -gt 90 ]]; then
    echo "API not ready — check: docker compose logs backend"
    exit 1
  fi
  sleep 2
done

TRIES=0
until curl -sf --max-time 8 -o /dev/null http://127.0.0.1/ 2>/dev/null; do
  TRIES=$((TRIES + 1))
  if [[ $TRIES -gt 60 ]]; then
    echo "Frontend not ready — check: docker compose logs frontend"
    exit 1
  fi
  sleep 3
done

PUBLIC_URL="$(grep -E '^PUBLIC_URL=' .env | cut -d= -f2- || echo 'http://127.0.0.1')"
log "Ready: ${PUBLIC_URL}"
log "Login: admin@example.com (see backend/.env FIRST_ADMIN_PASSWORD)"
