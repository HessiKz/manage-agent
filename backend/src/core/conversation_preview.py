"""Human-readable previews for conversation list (no JSON / tool scaffolding / markdown)."""

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
    "\n---\n",
    "[زمینه صفحه",
)

_PROMPT_MARKER = "<!--ma-inputs-->"

_JSON_LINE = re.compile(r"^\s*[\{\[]")
_TECH_LINE = re.compile(
    r"(agent_id|storage_path|tool_chain|function calling|demo-files|\{\{[^}]+\}\})",
    re.I,
)

_SYSTEM_JUNK = re.compile(
    r"automatic validation run|"
    r"return a one-line successful response|"
    r"complete this action by calling|"
    r"context for tools",
    re.I,
)

_HTML_COMMENT = re.compile(r"<!--[\s\S]*?-->")
_MD_HEADER = re.compile(r"^#{1,6}\s+", re.MULTILINE)
_MD_BOLD = re.compile(r"\*\*([^*]+)\*\*")
_MD_ITALIC = re.compile(r"(?<!\*)\*([^*]+)\*(?!\*)")
_MD_CODE = re.compile(r"`([^`]+)`")
_MD_LINK = re.compile(r"\[([^\]]+)\]\([^)]*\)")
_TEMPLATE_VAR = re.compile(r"\{\{[^}]+\}\}")


def _strip_markdown_syntax(text: str) -> str:
    s = _HTML_COMMENT.sub("", text)
    s = _MD_HEADER.sub("", s)
    s = _MD_BOLD.sub(r"\1", s)
    s = _MD_ITALIC.sub(r"\1", s)
    s = _MD_CODE.sub(r"\1", s)
    s = _MD_LINK.sub(r"\1", s)
    s = _TEMPLATE_VAR.sub("", s)
    return s


def _collapse_ws(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _is_system_only_junk(text: str) -> bool:
    if not text:
        return True
    if _SYSTEM_JUNK.search(text) and not re.search(r"[\u0600-\u06FF]{4,}", text):
        return True
    if re.fullmatch(r"[A-Za-z0-9\s.,;:'\"?!\-]+", text) and len(text) > 40:
        return True
    return False


def plain_text_preview(text: str | None, *, max_len: int = 120) -> str:
    """Plain Persian-friendly one-liner for lists, notifications, and cards."""
    if not text:
        return ""

    s = text.strip()

    if _PROMPT_MARKER in s:
        s = s.split(_PROMPT_MARKER, 1)[0].strip()

    if "---" in s:
        tail = s.rsplit("---", 1)[-1].strip()
        if tail:
            s = tail

    for marker in _INPUT_MARKERS:
        idx = s.find(marker)
        if idx >= 0:
            s = s[:idx].strip()

    s = _strip_markdown_syntax(s)
    s = re.sub(r"\{[^{}]{0,200}\}", "", s)
    s = _collapse_ws(s)

    if _is_system_only_junk(s):
        return "اجرای تست خودکار"

    if len(s) > max_len:
        s = s[: max_len - 1].rstrip() + "…"
    return s


def humanize_user_message(text: str | None, *, max_len: int = 120) -> str:
    """First user-facing line only — strip tool context, JSON, and LLM instructions."""
    if not text:
        return ""

    s = text.strip()

    if _PROMPT_MARKER in s:
        s = s.split(_PROMPT_MARKER, 1)[0].strip()

    if "---" in s:
        tail = s.rsplit("---", 1)[-1].strip()
        if tail:
            s = tail

    for marker in _INPUT_MARKERS:
        idx = s.find(marker)
        if idx >= 0:
            s = s[:idx].strip()

    lines: list[str] = []
    for line in s.splitlines():
        t = line.strip()
        if not t:
            continue
        if _HTML_COMMENT.search(t):
            t = _HTML_COMMENT.sub("", t).strip()
            if not t:
                continue
        if _JSON_LINE.match(t):
            continue
        if _TECH_LINE.search(t):
            continue
        if t.startswith("{"):
            continue
        if _SYSTEM_JUNK.search(t) and not re.search(r"[\u0600-\u06FF]", t):
            continue
        lines.append(t)

    if lines:
        s = " ".join(lines)
    else:
        s = s.split("\n", 1)[0].strip()

    s = _strip_markdown_syntax(s)
    s = re.sub(r"\{[^{}]{0,200}\}", "", s)
    s = _collapse_ws(s)

    if _is_system_only_junk(s):
        if _TECH_LINE.search(text or "") or _JSON_LINE.match((text or "").strip()):
            return ""
        return "اجرای تست خودکار"

    return plain_text_preview(s, max_len=max_len) if s else ""


def humanize_output_preview(text: str | None, *, max_len: int = 120) -> str:
    """Assistant summary for lists — sanitized plain text, no markdown/API paths."""
    if not text:
        return ""

    s = sanitize_chat_output(text)
    s = re.sub(
        r"/api/v1/demo-files/[^\s)\]\"']+",
        "فایل گزارش",
        s,
    )
    s = re.sub(r"https?://[^\s]+", "لینک", s)
    s = _strip_markdown_syntax(s)
    s = _collapse_ws(s)

    if _is_system_only_junk(s):
        return ""

    return plain_text_preview(s, max_len=max_len)


def action_label_from_log_action(action: str) -> str | None:
    """action:generate_payslips → generate_payslips (for optional display)."""
    if action.startswith("action:"):
        return action.split(":", 1)[1]
    return None
