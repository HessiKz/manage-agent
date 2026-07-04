#!/bin/sh
# #region agent log
LOG="/app/.debug-session.ndjson"
TS=$(date +%s)000
printf '{"sessionId":"1ffdf7","runId":"frontend-start","hypothesisId":"H1","location":"docker-dev-entry.sh","message":"frontend dev starting","data":{"uid":"%s","gid":"%s","next_writable":"%s"},"timestamp":%s}\n' \
  "$(id -u)" "$(id -g)" "$(test -w /app/.next && echo true || echo false)" "$TS" >> "$LOG" 2>/dev/null || true
# #endregion
exec npm run dev -- -H 0.0.0.0
