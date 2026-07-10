#!/usr/bin/env bash
# Start dev stack detached from the terminal (survives closing Cursor/SSH).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PIDFILE="$ROOT/.dev.pid"
LOG="$ROOT/logs/dev.log"

mkdir -p "$ROOT/logs"

if [[ -f "$PIDFILE" ]]; then
  OLD_PID="$(cat "$PIDFILE")"
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "Dev already running (PID ${OLD_PID}). Log: ${LOG}"
    exit 0
  fi
  rm -f "$PIDFILE"
fi

cd "$ROOT"
setsid nohup ./scripts/dev.sh >>"$LOG" 2>&1 &
echo $! >"$PIDFILE"

echo "Dev started in background (PID $(cat "$PIDFILE"))."
echo "Log: ${LOG}"
echo "Stop: make dev-stop"
