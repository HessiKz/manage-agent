#!/usr/bin/env bash
# Pull latest code, rebuild, migrate, restart — run on the server after git pull.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile prod)

log() { printf '\033[1;34m▶\033[0m %s\n' "$*"; }

if [[ -d .git ]]; then
  log "Git pull…"
  git pull --ff-only
fi

log "Rebuild images…"
"${COMPOSE[@]}" build

log "Apply migrations…"
"${COMPOSE[@]}" up -d
"${COMPOSE[@]}" exec -T backend alembic upgrade head

log "Restart services…"
"${COMPOSE[@]}" up -d --remove-orphans

log "Status:"
"${COMPOSE[@]}" ps
