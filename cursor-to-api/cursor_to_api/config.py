import os
from pathlib import Path

HOST = os.getenv("CURSOR_TO_API_HOST", "127.0.0.1")
PORT = int(os.getenv("CURSOR_TO_API_PORT", "9191"))
API_KEY = os.getenv("CURSOR_TO_API_KEY", "")
AGENT_BIN = os.getenv("CURSOR_TO_API_AGENT_BIN", "agent")
WORKSPACE = Path(os.getenv("CURSOR_TO_API_WORKSPACE", os.getcwd())).resolve()
AGENT_TRUST = os.getenv("CURSOR_TO_API_TRUST", "true").lower() in ("1", "true", "yes")
AGENT_FORCE = os.getenv("CURSOR_TO_API_FORCE", "false").lower() in ("1", "true", "yes")
DEFAULT_MODEL = os.getenv("CURSOR_TO_API_DEFAULT_MODEL", "auto")
REQUEST_TIMEOUT_SEC = int(os.getenv("CURSOR_TO_API_TIMEOUT", "600"))
