#!/usr/bin/env bash
# Fast deploy to an offline / air-gapped VPS (no 300MB image upload every time).
#
# Modes:
#   sync      — rsync code / build output into running containers (default, ~2–70MB)
#   registry  — push to a local registry; VPS pulls only changed layers over SSH tunnel
#   full      — legacy docker save | gzip upload (~320MB)
#
# Usage:
#   cp .deploy.env.example .deploy.env   # set VPS_HOST, VPS_PASSWORD
#   ./scripts/deploy-vps.sh              # sync backend + frontend
#   ./scripts/deploy-vps.sh sync backend
#   ./scripts/deploy-vps.sh registry all
#   ./scripts/deploy-vps.sh full frontend
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
[[ -f "$ROOT/.deploy.env" ]] && source "$ROOT/.deploy.env"

# .deploy.env edited on Windows often has CRLF — breaks DNS (host becomes "ip\r").
strip_deploy_var() { printf '%s' "${1:-}" | tr -d '\r'; }

MODE="${1:-sync}"
TARGET="${2:-all}"

VPS_HOST="$(strip_deploy_var "${VPS_HOST:-45.138.135.253}")"
VPS_USER="$(strip_deploy_var "${VPS_USER:-root}")"
VPS_PASSWORD="$(strip_deploy_var "${VPS_PASSWORD:-}")"
VPS_DIR="$(strip_deploy_var "${VPS_DIR:-/root/manage-agent}")"
REMOTE_STAGE="${REMOTE_STAGE:-/root/.manage-agent-deploy}"
REGISTRY_PORT="${REGISTRY_PORT:-5000}"
REGISTRY_NAME="${REGISTRY_NAME:-ma-local-registry}"

COMPOSE_REMOTE="cd $VPS_DIR && docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.fast.yml --profile prod"

log() { printf '\033[1;34m▶\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

TRANSPORT_PY="$ROOT/scripts/_vps_transport.py"
export VPS_HOST VPS_USER VPS_PASSWORD

use_python_transport() {
  [[ -n "${VPS_PASSWORD:-}" ]] && ! command -v sshpass &>/dev/null
}

ssh_cmd() {
  if use_python_transport; then
    python3 "$TRANSPORT_PY" run "$*"
    return $?
  fi
  local opts=(-o StrictHostKeyChecking=no -o ConnectTimeout=20)
  if [[ -n "${VPS_PASSWORD:-}" ]] && command -v sshpass &>/dev/null; then
    sshpass -p "$VPS_PASSWORD" ssh "${opts[@]}" "${VPS_USER}@${VPS_HOST}" "$@"
  else
    ssh "${opts[@]}" "${VPS_USER}@${VPS_HOST}" "$@"
  fi
}

rsync_to_vps() {
  local src="$1" dest="$2"
  if use_python_transport; then
    python3 "$TRANSPORT_PY" rsync "$src" "$dest"
    return
  fi
  local ssh_rsh="ssh -o StrictHostKeyChecking=no -o ConnectTimeout=20"
  if [[ -n "${VPS_PASSWORD:-}" ]] && command -v sshpass &>/dev/null; then
    ssh_rsh="sshpass -p $VPS_PASSWORD $ssh_rsh"
  fi
  rsync -az --delete -e "$ssh_rsh" "$src" "${VPS_USER}@${VPS_HOST}:$dest"
}

upload_to_vps() {
  local src="$1" dest="$2"
  if use_python_transport; then
    python3 "$TRANSPORT_PY" upload "$src" "$dest"
    return
  fi
  rsync_to_vps "$src" "$dest"
}

wait_healthy() {
  local target="${1:-all}"
  local tries="${2:-30}"
  for ((i = 1; i <= tries; i++)); do
    local backend_ok=1 frontend_ok=1 site_ok=1 api_ok=1 out
    if [[ "$target" == "backend" || "$target" == "all" ]]; then
      out="$(ssh_cmd "docker ps --filter name=ma-backend --format '{{.Status}}' 2>/dev/null || true")"
      [[ "$out" == *healthy* ]] && backend_ok=0
      out="$(ssh_cmd "docker exec ma-backend curl -fsS --max-time 3 http://127.0.0.1:8000/health 2>/dev/null || true")"
      [[ "$out" == *'"status":"ok"'* || "$out" == *'"status": "ok"'* ]] && backend_ok=0
    else
      backend_ok=0
    fi
    if [[ "$target" == "frontend" || "$target" == "all" ]]; then
      out="$(ssh_cmd "docker ps --filter name=ma-frontend --format '{{.Status}}' 2>/dev/null || true")"
      [[ "$out" == *healthy* ]] && frontend_ok=0
    else
      frontend_ok=0
    fi
    if [[ "$target" == "all" ]]; then
      out="$(ssh_cmd "curl -fsS --max-time 5 -o /dev/null -w 'site:%{http_code}' http://127.0.0.1/ 2>/dev/null || true")"
      [[ "$out" == *site:200* ]] && site_ok=0
      out="$(ssh_cmd "curl -fsS --max-time 5 http://127.0.0.1/health 2>/dev/null || true")"
      [[ "$out" == *'"status":"ok"'* || "$out" == *'"status": "ok"'* ]] && api_ok=0
    else
      site_ok=0
      api_ok=0
    fi
    if [[ "$backend_ok" -eq 0 && "$frontend_ok" -eq 0 && "$site_ok" -eq 0 && "$api_ok" -eq 0 ]]; then
      log "Services healthy"
      return 0
    fi
    log "Waiting for health ($i/$tries)…"
    sleep 5
  done
  warn "Health check timed out — check: ssh ${VPS_USER}@${VPS_HOST} 'docker ps && curl -v http://127.0.0.1/health'"
  return 1
}

need_deps_rebuild() {
  local svc="$1"
  if [[ "$svc" == "backend" ]]; then
    git diff --name-only HEAD 2>/dev/null | grep -qE '^backend/(pyproject\.toml|Dockerfile|alembic/)' && return 0
  else
    git diff --name-only HEAD 2>/dev/null | grep -qE '^frontend/(package\.json|package-lock\.json|Dockerfile)' && return 0
  fi
  return 1
}

sync_infra() {
  log "Sync compose + nginx config…"
  rsync_to_vps "$ROOT/docker-compose.prod.yml" "$VPS_DIR/docker-compose.prod.yml"
  rsync_to_vps "$ROOT/docker-compose.fast.yml" "$VPS_DIR/docker-compose.fast.yml"
  rsync_to_vps "$ROOT/nginx/nginx.conf" "$VPS_DIR/nginx/nginx.conf"
  # Recreate backend so env/volume changes from compose apply (restart alone won't).
  ssh_cmd "$COMPOSE_REMOTE up -d --force-recreate backend nginx 2>/dev/null || true"
}

sync_backend() {
  if need_deps_rebuild backend; then
    warn "backend/pyproject.toml or Dockerfile changed — use: ./scripts/deploy-vps.sh registry backend"
  fi
  sync_infra
  log "Sync backend source (~2MB)…"
  ssh_cmd "mkdir -p $REMOTE_STAGE/backend"
  rsync_to_vps "$ROOT/backend/src/" "$REMOTE_STAGE/backend/src/"
  rsync_to_vps "$ROOT/backend/assets/" "$REMOTE_STAGE/backend/assets/"
  log "Apply backend patch + restart…"
  ssh_cmd "docker cp $REMOTE_STAGE/backend/src/. ma-backend:/app/src/ && \
    docker cp $REMOTE_STAGE/backend/assets/. ma-backend:/app/assets/ && \
    docker restart ma-backend"
  wait_healthy backend 30 || die "Backend failed health check after sync"
}

sync_frontend() {
  if need_deps_rebuild frontend; then
    warn "frontend/package.json or Dockerfile changed — use: ./scripts/deploy-vps.sh registry frontend"
  fi
  log "Build frontend locally (same-origin /api via nginx)…"
  (cd "$ROOT/frontend" && NEXT_PUBLIC_API_URL= npm run build)
  log "Sync Next.js output (rsync sends only changed files)…"
  ssh_cmd "mkdir -p $REMOTE_STAGE/frontend/{standalone,static,public}"
  rsync_to_vps "$ROOT/frontend/.next/standalone/" "$REMOTE_STAGE/frontend/standalone/"
  rsync_to_vps "$ROOT/frontend/.next/static/" "$REMOTE_STAGE/frontend/static/"
  rsync_to_vps "$ROOT/frontend/public/" "$REMOTE_STAGE/frontend/public/"
  log "Apply frontend patch + restart…"
  ssh_cmd "docker cp $REMOTE_STAGE/frontend/standalone/. ma-frontend:/app/ && \
    docker cp $REMOTE_STAGE/frontend/static/. ma-frontend:/app/.next/static/ && \
    docker cp $REMOTE_STAGE/frontend/public/. ma-frontend:/app/public/ && \
    docker restart ma-frontend"
  wait_healthy frontend 30 || die "Frontend failed health check after sync"
}

ensure_local_registry() {
  if ! docker inspect "$REGISTRY_NAME" &>/dev/null; then
    log "Starting local Docker registry on 127.0.0.1:${REGISTRY_PORT}…"
    docker run -d -p "127.0.0.1:${REGISTRY_PORT}:5000" --restart unless-stopped --name "$REGISTRY_NAME" registry:2
  fi
}

build_and_push() {
  local svc="$1"
  ensure_local_registry
  if [[ "$svc" == "backend" ]]; then
    log "Build backend image…"
    docker build -f backend/Dockerfile -t manage-agent-backend:latest backend
    docker tag manage-agent-backend:latest "localhost:${REGISTRY_PORT}/manage-agent-backend:latest"
    docker push "localhost:${REGISTRY_PORT}/manage-agent-backend:latest"
  else
    log "Build frontend image…"
    docker build -f frontend/Dockerfile -t manage-agent-frontend:latest --build-arg NEXT_PUBLIC_API_URL= frontend
    docker tag manage-agent-frontend:latest "localhost:${REGISTRY_PORT}/manage-agent-frontend:latest"
    docker push "localhost:${REGISTRY_PORT}/manage-agent-frontend:latest"
  fi
}

registry_pull_and_restart() {
  local svc="$1"
  if [[ "$svc" == "backend" || "$svc" == "all" ]]; then
    build_and_push backend
  fi
  if [[ "$svc" == "frontend" || "$svc" == "all" ]]; then
    build_and_push frontend
  fi

  log "Pull on VPS through SSH tunnel (only new layers transfer)…"
  local pull_cmds=""
  local recreate=()
  if [[ "$svc" == "backend" || "$svc" == "all" ]]; then
    pull_cmds+="docker pull 127.0.0.1:${REGISTRY_PORT}/manage-agent-backend:latest && "
    pull_cmds+="docker tag 127.0.0.1:${REGISTRY_PORT}/manage-agent-backend:latest manage-agent-backend:latest && "
    recreate+=(backend)
  fi
  if [[ "$svc" == "frontend" || "$svc" == "all" ]]; then
    pull_cmds+="docker pull 127.0.0.1:${REGISTRY_PORT}/manage-agent-frontend:latest && "
    pull_cmds+="docker tag 127.0.0.1:${REGISTRY_PORT}/manage-agent-frontend:latest manage-agent-frontend:latest && "
    recreate+=(frontend)
  fi
  pull_cmds+="cd $VPS_DIR && $COMPOSE_REMOTE up -d --force-recreate ${recreate[*]}"

  if use_python_transport; then
    die "registry mode needs sshpass or SSH keys (reverse tunnel). Install: sudo apt install sshpass"
  fi
  local opts=(-o StrictHostKeyChecking=no -o ConnectTimeout=20 -R "127.0.0.1:${REGISTRY_PORT}:127.0.0.1:${REGISTRY_PORT}")
  if [[ -n "${VPS_PASSWORD:-}" ]] && command -v sshpass &>/dev/null; then
    sshpass -p "$VPS_PASSWORD" ssh "${opts[@]}" "${VPS_USER}@${VPS_HOST}" "$pull_cmds"
  else
    ssh "${opts[@]}" "${VPS_USER}@${VPS_HOST}" "$pull_cmds"
  fi
}

full_upload() {
  local svc="$1"
  local tarball="/tmp/manage-agent-deploy-$$.tar.gz"
  trap 'rm -f "$tarball"' EXIT

  if [[ "$svc" == "backend" ]]; then
    docker build -f backend/Dockerfile -t manage-agent-backend:latest backend
    docker save manage-agent-backend:latest | gzip > "$tarball"
    remote_name="manage-agent-backend-only.tar.gz"
  elif [[ "$svc" == "frontend" ]]; then
    docker build -f frontend/Dockerfile -t manage-agent-frontend:latest --build-arg NEXT_PUBLIC_API_URL= frontend
    docker save manage-agent-frontend:latest | gzip > "$tarball"
    remote_name="manage-agent-frontend-only.tar.gz"
  else
    docker build -f backend/Dockerfile -t manage-agent-backend:latest backend
    docker build -f frontend/Dockerfile -t manage-agent-frontend:latest --build-arg NEXT_PUBLIC_API_URL= frontend
    docker save manage-agent-backend:latest manage-agent-frontend:latest | gzip > "$tarball"
    remote_name="manage-agent-images-new.tar.gz"
  fi

  log "Upload $(du -h "$tarball" | cut -f1)…"
  upload_to_vps "$tarball" "/root/$remote_name"
  ssh_cmd "gunzip -c /root/$remote_name | docker load && cd $VPS_DIR && docker rm -f ma-frontend ma-backend 2>/dev/null; $COMPOSE_REMOTE up -d --force-recreate backend frontend"
}

run_target() {
  local mode="$1" svc="$2"
  case "$mode" in
    sync)
      case "$svc" in
        backend) sync_backend ;;
        frontend) sync_frontend ;;
        all) sync_backend; sync_frontend ;;
        *) die "Unknown target: $svc (backend|frontend|all)" ;;
      esac
      ;;
    registry)
      registry_pull_and_restart "$svc"
      ;;
    full)
      full_upload "$svc"
      ;;
    *)
      die "Unknown mode: $mode (sync|registry|full)"
      ;;
  esac
}

[[ -n "${VPS_PASSWORD:-}" ]] || warn "VPS_PASSWORD not set — using SSH keys (see .deploy.env.example)"

log "Deploy mode=$MODE target=$TARGET → ${VPS_USER}@${VPS_HOST}"
run_target "$MODE" "$TARGET"
wait_healthy "$TARGET"
log "Done — http://${VPS_HOST}/"
