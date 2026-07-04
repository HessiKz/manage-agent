"""Shared workspace path / URL parsing — handles spaces and Persian in filenames."""

from __future__ import annotations

import re
from urllib.parse import quote, unquote
from uuid import uuid4

# Match workspace rel paths through a known extension (spaces allowed).
_WORKSPACE_REL_UNTIL_EXT = (
    r"[^\n)\]\"'<>]*?"
    r"\.(?:xlsx|xls|pdf|csv|docx?|zip|txt|json)"
)

WORKSPACE_API_PATH_RE = re.compile(
    rf"/api/v1/agents/([0-9a-fA-F-]{{36}})/workspace/({_WORKSPACE_REL_UNTIL_EXT})",
    re.IGNORECASE,
)

STORAGE_PATH_FRAGMENT_RE = re.compile(
    rf"(?:var/agent_files/|storage_path=)"
    rf"([0-9a-fA-F-]{{36}})"
    rf"[/\\]({_WORKSPACE_REL_UNTIL_EXT})",
    re.IGNORECASE,
)


def encode_workspace_rel(rel: str) -> str:
    return quote(rel.replace("\\", "/"), safe="/")


def decode_workspace_rel(rel: str) -> str:
    return unquote((rel or "").strip())


def safe_output_filename(prefix: str, ext: str) -> str:
    """ASCII-only output name — safe for URLs without encoding edge cases."""
    clean = re.sub(r"[^a-zA-Z0-9_-]", "", prefix) or "output"
    return f"{clean}-{uuid4().hex[:8]}.{ext.lstrip('.')}"
