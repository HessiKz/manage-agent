"""Normalize assistant chat output for end users (strip model scaffolding)."""

from __future__ import annotations

import json
import re

# :::writing / :::reply fenced blocks (Cursor-style and similar)
_FENCE_BLOCK = re.compile(
    r":::+(\w+)?\s*\n([\s\S]*?)\n:::+\s*",
    re.MULTILINE,
)

_ORPHAN_FENCE_LINE = re.compile(r"^:::+\s*\w*\s*$", re.MULTILINE)

_LT = chr(60)
_THINK_BLOCK = re.compile(
    _LT + r"\s*think\b[^>]*>[\s\S]*?" + _LT + r"/\s*think\s*>",
    re.IGNORECASE,
)
_THINK_XML = re.compile(
    _LT + r"think(?:ing)?>[\s\S]*?" + _LT + r"/think(?:ing)?>",
    re.IGNORECASE,
)

_PREFERRED_FENCE_LABELS = (
    "writing",
    "reply",
    "response",
    "message",
    "answer",
    "output",
    "text",
)

# Meta commentary often wrapped around a deliverable (Persian + English)
_META_START = re.compile(
    r"^[\s\S]{0,400}?(?:می‌تونیم|میتونیم|می‌توانیم|میتوانیم|"
    r"here(?:'s| is)|below is|draft)(?:[\s\S]{0,120}?)(?:[:：]\s*|\n\n)",
    re.IGNORECASE | re.MULTILINE,
)
_META_END = re.compile(
    r"\n\n[\s\S]{0,300}?(?:اگر بگی|اگه بگی|if you (?:tell|share|provide)|"
    r"let me know|personali[sz]e|customi[sz]e|TK-\d+).*$",
    re.IGNORECASE | re.DOTALL,
)


def _collapse_blank_lines(text: str) -> str:
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _strip_reasoning_wrappers(text: str) -> str:
    text = _THINK_BLOCK.sub("", text)
    text = _THINK_XML.sub("", text)
    return text


def _strip_meta_wrappers(text: str) -> str:
    text = _META_START.sub("", text, count=1)
    text = _META_END.sub("", text, count=1)
    return text


def _extract_fenced_content(text: str) -> str | None:
    matches = list(_FENCE_BLOCK.finditer(text))
    if not matches:
        return None

    by_label: dict[str, list[str]] = {}
    for m in matches:
        label = (m.group(1) or "").lower()
        inner = (m.group(2) or "").strip()
        if inner:
            by_label.setdefault(label, []).append(inner)

    for preferred in _PREFERRED_FENCE_LABELS:
        if preferred in by_label:
            return "\n\n".join(by_label[preferred])

    if len(matches) == 1:
        return (matches[0].group(2) or "").strip()

    # Multiple unnamed or mixed blocks — keep all inner bodies, drop scaffolding
    parts = [(m.group(2) or "").strip() for m in matches if (m.group(2) or "").strip()]
    return "\n\n".join(parts) if parts else None


_PLATFORM_JSON_BLOCK = re.compile(
    r"\{[^{}]*(?:\"ui_script\"|\"ui_action\"|\"append_json\")[^{}]*\}",
    re.DOTALL,
)
_HIGHLIGHT_JSON = re.compile(r'\{\s*"highlight"\s*:\s*"[^"]*"\s*\}')
_UI_PROGRESS_LINE = re.compile(
    r"^الان «.+» را از طریق رابط کاربری انجام می‌دهم\.?\s*$",
    re.MULTILINE,
)
_UI_OPENING_LINE = re.compile(
    r"^در حال باز کردن فهرست.*$",
    re.MULTILINE,
)


def humanize_platform_tool_output(text: str) -> str:
    """Turn raw platform tool JSON into a short Persian status line."""
    raw = (text or "").strip()
    if not raw:
        return raw
    if len(raw) > 80 and not raw.startswith("{"):
        cleaned = _HIGHLIGHT_JSON.sub("", raw)
        cleaned = _PLATFORM_JSON_BLOCK.sub("", cleaned)
        cleaned = _UI_PROGRESS_LINE.sub("", cleaned)
        cleaned = _UI_OPENING_LINE.sub("", cleaned)
        return _collapse_blank_lines(cleaned) or raw
    if raw.startswith("{"):
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            data = None
        if isinstance(data, dict):
            msg = data.get("message")
            if isinstance(msg, str) and msg.strip():
                return msg.strip()
            script = data.get("ui_script")
            if isinstance(script, dict):
                label = script.get("label")
                if isinstance(label, str) and label.strip():
                    return f"الان «{label.strip()}» را از طریق رابط کاربری انجام می‌دهم."
            if data.get("success"):
                return "در حال انجام درخواست شما از طریق رابط کاربری…"
    cleaned = _HIGHLIGHT_JSON.sub("", raw)
    cleaned = _PLATFORM_JSON_BLOCK.sub("", cleaned).strip()
    cleaned = _UI_PROGRESS_LINE.sub("", cleaned)
    cleaned = _UI_OPENING_LINE.sub("", cleaned)
    return _collapse_blank_lines(cleaned) or raw


def sanitize_chat_output(text: str) -> str:
    """
    Return user-facing assistant text: extract :::writing-style blocks,
    remove reasoning tags, orphan ::: lines, and common meta pre/postamble.
    """
    if not text:
        return text

    cleaned = text.strip()
    cleaned = _strip_reasoning_wrappers(cleaned)

    fenced = _extract_fenced_content(cleaned)
    if fenced is not None:
        cleaned = fenced
    else:
        cleaned = _ORPHAN_FENCE_LINE.sub("", cleaned)

    cleaned = _strip_meta_wrappers(cleaned)
    cleaned = _ORPHAN_FENCE_LINE.sub("", cleaned)
    cleaned = humanize_platform_tool_output(cleaned)
    cleaned = _PLATFORM_JSON_BLOCK.sub("", cleaned)
    result = _collapse_blank_lines(cleaned)
    if result:
        return result
    if text.strip():
        fallback = _ORPHAN_FENCE_LINE.sub("", text.strip())
        fallback = _strip_reasoning_wrappers(fallback)
        fallback = _collapse_blank_lines(fallback)
        if fallback:
            return fallback
        return text.strip()
    return result
