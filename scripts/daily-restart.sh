#!/usr/bin/env bash
# Daily refresh: recreate app containers from images (keeps DB/redis data).
set -euo pipefail

ROOT="/root/manage-agent"
LOG_TAG="[manage-agent-restart]"
COMPOSE=(
  docker compose
  -f docker-compose.yml
  -f docker-compose.prod.yml
  -f docker-compose.fast.yml
  --profile prod
)

log() {
  echo "$(date -Is) ${LOG_TAG} $*"
}

cd "${ROOT}"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

export PUBLIC_URL="${PUBLIC_URL:-http://45.138.135.253}"

log "Starting daily container refresh…"

"${COMPOSE[@]}" up -d --force-recreate --no-deps frontend backend

log "Waiting for backend health…"
TRIES=0
until docker exec ma-backend curl -fsS --max-time 3 http://127.0.0.1:8000/health >/dev/null 2>&1; do
  TRIES=$((TRIES + 1))
  if [[ ${TRIES} -ge 60 ]]; then
    log "ERROR: backend did not become healthy in time"
    exit 1
  fi
  sleep 2
done

log "Waiting for frontend health…"
TRIES=0
until docker exec ma-frontend wget -qO- --timeout=3 http://127.0.0.1:3000/ >/dev/null 2>&1; do
  TRIES=$((TRIES + 1))
  if [[ ${TRIES} -ge 60 ]]; then
    log "ERROR: frontend did not become healthy in time"
    exit 1
  fi
  sleep 2
done

log "Done. $(docker ps --format '{{.Names}} {{.Status}}' | tr '\n' ' ')"
