#!/usr/bin/env bash
# Light source push to VPS — incremental rsync (like git push), not a 300MB image upload.
#
#   ./scripts/rsync-source.sh              # mirror source + hot-patch containers
#   ./scripts/rsync-source.sh --no-apply   # mirror only (no docker restart)
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
[[ -f "$ROOT/.deploy.env" ]] && source "$ROOT/.deploy.env"

strip() { printf '%s' "${1:-}" | tr -d '\r'; }
VPS_HOST="$(strip "${VPS_HOST:-45.138.135.253}")"
VPS_USER="$(strip "${VPS_USER:-root}")"
VPS_DIR="$(strip "${VPS_DIR:-/root/manage-agent}")"
VPS_PASSWORD="$(strip "${VPS_PASSWORD:-}")"

APPLY=1
[[ "${1:-}" == "--no-apply" ]] && APPLY=0

SSH="ssh -o StrictHostKeyChecking=no -o ConnectTimeout=20"
if [[ -n "$VPS_PASSWORD" ]] && command -v sshpass &>/dev/null; then
  SSH="sshpass -p $VPS_PASSWORD $SSH"
fi

EXCLUDES=(
  --exclude '.git/'
  --exclude 'node_modules/'
  --exclude 'frontend/.next/'
  --exclude 'backend/venv/'
  --exclude 'graphify-out/'
  --exclude 'backend/graphify-out/'
  --exclude '__pycache__/'
  --exclude '.pytest_cache/'
  --exclude 'backend/var/'
  --exclude '.cursor/'
  --exclude 'agent-tools/'
  --exclude '.env'
  --exclude '.deploy.env'
  --exclude '*.pyc'
  --exclude '.turbo/'
  --exclude 'playwright-report/'
  --exclude 'coverage/'
)

printf '\033[1;34m▶\033[0m rsync source → %s@%s:%s/ (~source only, no node_modules/venv/.next)\n' \
  "$VPS_USER" "$VPS_HOST" "$VPS_DIR"

rsync -az "${EXCLUDES[@]}" -e "$SSH" "$ROOT/" "${VPS_USER}@${VPS_HOST}:${VPS_DIR}/"

if [[ "$APPLY" -eq 1 ]]; then
  printf '\033[1;34m▶\033[0m apply to running containers…\n'
  "$ROOT/scripts/deploy-vps.sh" sync all
else
  printf '\033[1;32m✓\033[0m source mirrored (containers unchanged)\n'
fi
