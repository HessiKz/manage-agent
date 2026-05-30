#!/usr/bin/env bash
# Install manage-agent on Ubuntu (CLI only) using Docker Compose + Nginx.
#
# Usage (on a fresh Ubuntu 22.04/24.04 server):
#   curl -fsSL .../install-ubuntu.sh | bash
#   — or —
#   sudo ./scripts/install-ubuntu.sh
#
# Prerequisites: git clone this repo to /opt/manage-agent (or set INSTALL_DIR).

set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
PUBLIC_URL="${PUBLIC_URL:-}"
SKIP_APT="${SKIP_APT:-0}"

log() { printf '\033[1;34m▶\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

if [[ "$(id -u)" -ne 0 ]]; then
  die "Run as root: sudo $0"
fi

export DEBIAN_FRONTEND=noninteractive

if [[ "$SKIP_APT" != "1" ]]; then
  log "Installing system packages (Docker, git, curl)…"
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl git openssl ufw

  if ! command -v docker >/dev/null 2>&1; then
    log "Installing Docker…"
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    . /etc/os-release
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
      ${VERSION_CODENAME} stable" >/etc/apt/sources.list.d/docker.list
    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
    systemctl enable --now docker
  fi
fi

command -v docker >/dev/null || die "Docker not found"
docker compose version >/dev/null 2>&1 || die "docker compose plugin not found"

cd "$INSTALL_DIR"

# ── Root .env (compose) ─────────────────────────────────────────────
if [[ ! -f .env ]]; then
  cp .env.example .env
  PG_PASS="$(openssl rand -hex 16)"
  RD_PASS="$(openssl rand -hex 16)"
  sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=${PG_PASS}/" .env
  sed -i "s/^REDIS_PASSWORD=.*/REDIS_PASSWORD=${RD_PASS}/" .env
  if [[ -z "$PUBLIC_URL" ]]; then
    DEFAULT_IP="$(hostname -I | awk '{print $1}')"
    PUBLIC_URL="http://${DEFAULT_IP}"
    log "PUBLIC_URL not set — using ${PUBLIC_URL} (set PUBLIC_URL env and re-run to change)"
  fi
  sed -i "s|^PUBLIC_URL=.*|PUBLIC_URL=${PUBLIC_URL}|" .env
else
  # shellcheck disable=SC1091
  set -a && source .env && set +a
  PUBLIC_URL="${PUBLIC_URL:-http://localhost}"
fi

# ── Backend .env ────────────────────────────────────────────────────
if [[ ! -f backend/.env ]]; then
  cp backend/.env.production.example backend/.env
  SECRET="$(openssl rand -hex 32)"
  ADMIN_PASS="$(openssl rand -base64 18 | tr -d '/+=' | head -c 20)"
  # shellcheck disable=SC1091
  set -a && source .env && set +a
  sed -i "s/^SECRET_KEY=.*/SECRET_KEY=${SECRET}/" backend/.env
  sed -i "s|^CORS_ORIGINS=.*|CORS_ORIGINS=${PUBLIC_URL}|" backend/.env
  sed -i "s/^FIRST_ADMIN_PASSWORD=.*/FIRST_ADMIN_PASSWORD=${ADMIN_PASS}/" backend/.env
  sed -i "s|postgresql+asyncpg://manage_agent:REPLACE@|postgresql+asyncpg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@|" backend/.env
  sed -i "s|postgresql+psycopg2://manage_agent:REPLACE@|postgresql+psycopg2://${POSTGRES_USER}:${POSTGRES_PASSWORD}@|" backend/.env
  sed -i "s|redis://:REPLACE@|redis://:${REDIS_PASSWORD}@|" backend/.env
  log "Admin login: $(grep ^FIRST_ADMIN_EMAIL= backend/.env | cut -d= -f2) / ${ADMIN_PASS}"
  log "Save the admin password above — it is not stored elsewhere."
fi

# ── Build & start ───────────────────────────────────────────────────
log "Building images (first run may take several minutes)…"
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile prod build

log "Starting stack…"
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile prod up -d

log "Waiting for API health…"
TRIES=0
until docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T backend curl -fsS http://127.0.0.1:8000/health >/dev/null 2>&1; do
  TRIES=$((TRIES + 1))
  if [[ $TRIES -gt 60 ]]; then
    die "Backend did not become healthy. Check: docker compose logs backend"
  fi
  sleep 2
done

log "Running database migrations…"
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T backend alembic upgrade head

log "Seeding catalog agents (optional)…"
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T backend \
  python -m src.database.seed --reset-agents || true

# ── Firewall (optional) ─────────────────────────────────────────────
if command -v ufw >/dev/null && ufw status | grep -q inactive; then
  log "Configuring UFW (allow SSH + HTTP)…"
  ufw allow OpenSSH
  ufw allow 80/tcp
  ufw --force enable
fi

echo ""
log "Done."
echo "  App:    ${PUBLIC_URL}"
echo "  Health: ${PUBLIC_URL}/health"
echo "  API:    ${PUBLIC_URL}/api/v1"
echo ""
echo "  Logs:   docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f"
echo "  Update: sudo ./scripts/deploy-update.sh"
echo ""
echo "  Set OPENAI_API_KEY in backend/.env then: docker compose ... restart backend"
