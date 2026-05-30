"""Normalize assistant chat output for end users (strip model scaffolding)."""

from __future__ import annotations

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
