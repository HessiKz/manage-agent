"""Human-readable previews for conversation list (no JSON / tool scaffolding)."""

from __future__ import annotations

import re

from src.core.chat_sanitize import sanitize_chat_output

# Blocks appended for the LLM — never show in UI previews
_INPUT_MARKERS = (
    "\n\nContext for tools",
    "\n\nComplete this action by calling",
    "\n\n---\nContext from knowledge base",
    "\n\n---\nفایل",
    "\n\n---\n",
)

_JSON_LINE = re.compile(
    r"^\s*[\{\[]"  # lines that are JSON objects/arrays
)
_TECH_LINE = re.compile(
    r"(agent_id|storage_path|tool_chain|function calling|demo-files)",
    re.I,
)


def humanize_user_message(text: str | None, *, max_len: int = 120) -> str:
    """First user-facing line only — strip tool context, JSON, and LLM instructions."""
    if not text:
        return ""

    s = text.strip()
    for marker in _INPUT_MARKERS:
        idx = s.find(marker)
        if idx >= 0:
            s = s[:idx].strip()

    lines: list[str] = []
    for line in s.splitlines():
        t = line.strip()
        if not t:
            continue
        if _JSON_LINE.match(t):
            continue
        if _TECH_LINE.search(t):
            continue
        if t.startswith("{"):
            continue
        lines.append(t)

    if lines:
        s = " ".join(lines)
    else:
        s = s.split("\n", 1)[0].strip()

    # Remove stray inline JSON fragments
    s = re.sub(r"\{[^{}]{0,200}\}", "", s)
    s = re.sub(r"\s+", " ", s).strip()

    if len(s) > max_len:
        s = s[: max_len - 1].rstrip() + "…"
    return s


def humanize_output_preview(text: str | None, *, max_len: int = 120) -> str:
    """Assistant summary for lists — sanitized, no raw API paths."""
    if not text:
        return ""

    s = sanitize_chat_output(text)
    s = re.sub(
        r"/api/v1/demo-files/[^\s)\]\"']+",
        "فایل گزارش",
        s,
    )
    s = re.sub(r"https?://[^\s]+", "لینک", s)
    s = re.sub(r"\s+", " ", s).strip()

    if len(s) > max_len:
        s = s[: max_len - 1].rstrip() + "…"
    return s


def action_label_from_log_action(action: str) -> str | None:
    """action:generate_payslips → generate_payslips (for optional display)."""
    if action.startswith("action:"):
        return action.split(":", 1)[1]
    return None
