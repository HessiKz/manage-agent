"""Append-only NDJSON debug log for Cursor debug sessions."""

from __future__ import annotations

import json
import time
from typing import Any

_LOG_PATH = "/home/hessi/Desktop/Developement/manage-agent/.cursor/debug-1ffdf7.log"
_SESSION = "1ffdf7"


def debug_session_log(
    location: str,
    message: str,
    data: dict[str, Any] | None = None,
    *,
    hypothesis_id: str = "?",
    run_id: str = "pre-fix",
) -> None:
    # #region agent log
    try:
        payload = {
            "sessionId": _SESSION,
            "runId": run_id,
            "hypothesisId": hypothesis_id,
            "location": location,
            "message": message,
            "data": data or {},
            "timestamp": int(time.time() * 1000),
        }
        with open(_LOG_PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps(payload, ensure_ascii=False, default=str) + "\n")
    except Exception:
        pass
    # #endregion
