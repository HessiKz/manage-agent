#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PIDFILE="$ROOT/.dev.pid"

if [[ ! -f "$PIDFILE" ]]; then
  echo "No dev PID file — stack may not be running."
  exit 0
fi

PID="$(cat "$PIDFILE")"
if kill -0 "$PID" 2>/dev/null; then
  echo "Stopping dev (PID ${PID})…"
  kill "$PID" 2>/dev/null || true
  for _ in $(seq 1 15); do
    kill -0 "$PID" 2>/dev/null || break
    sleep 1
  done
  if kill -0 "$PID" 2>/dev/null; then
    kill -9 "$PID" 2>/dev/null || true
  fi
else
  echo "Dev PID ${PID} not running."
fi

rm -f "$PIDFILE"
echo "Done."
