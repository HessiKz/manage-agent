"""Platform-wide runtime upload selection — never use samples, instructions, or prior outputs."""

from __future__ import annotations

import re
from pathlib import Path
from types import SimpleNamespace
from typing import Protocol

from src.core.agent_file_roles import (
    agent_file_role,
    is_instruction_file,
    is_output_sample_file,
)

_AGENT_FILES_ROOT = Path("var/agent_files")

# Tool-generated exports (ASCII-safe names from processor/tools).
_GENERATED_OUTPUT_RE = re.compile(
    r"^(?:karkard-[0-9a-f]{8}|output-[0-9a-f]{8})\.[a-z0-9]+$",
    re.IGNORECASE,
)


class FileRow(Protocol):
    filename: str | None
    storage_path: str


def is_generated_output_filename(name: str | None) -> bool:
    """True for tool-written exports, not user uploads."""
    base = Path(name or "").name
    if _GENERATED_OUTPUT_RE.match(base):
        return True
    lower = base.lower()
    if lower.startswith("karkard-") and lower.endswith("-processed.xlsx"):
        return True
    return False


def is_runtime_upload_candidate(
    filename: str | None,
    storage_path: str | None = None,
    *,
    extensions: tuple[str, ...] | None = None,
) -> bool:
    """User/runtime input only — excludes wizard samples, instructions, tool outputs."""
    name = filename or ""
    path_name = Path(storage_path or "").name
    for candidate in (name, path_name):
        if not candidate:
            continue
        if is_instruction_file(candidate) or is_output_sample_file(candidate):
            return False
        if is_generated_output_filename(candidate):
            return False
        if agent_file_role(candidate) != "runtime":
            return False
    if extensions and name:
        if not name.lower().endswith(extensions):
            return False
    return bool(name or path_name)


def list_agent_file_rows(agent_id: str, *, extensions: tuple[str, ...] = (".xlsx", ".xls")) -> list[FileRow]:
    """On-disk agent uploads newest first."""
    root = _AGENT_FILES_ROOT / str(agent_id)
    if not root.is_dir():
        return []
    rows: list[FileRow] = []
    paths: list[Path] = []
    for ext in extensions:
        paths.extend(root.rglob(f"*{ext}"))
    paths = sorted({p.resolve() for p in paths if p.is_file()}, key=lambda p: p.stat().st_mtime, reverse=True)
    for path in paths:
        display = path.name.split("_", 1)[1] if "_" in path.name else path.name
        rows.append(SimpleNamespace(filename=display, storage_path=str(path)))
    return rows


def pick_runtime_agent_file(
    files: list[FileRow],
    *,
    extensions: tuple[str, ...] = (".xlsx", ".xls", ".pdf", ".csv"),
) -> FileRow | None:
    """Newest runtime upload that passes role filters."""
    for row in files:
        if is_runtime_upload_candidate(row.filename, row.storage_path, extensions=extensions):
            return row
    return None


def resolve_locked_runtime_file(
    agent_id: str,
    storage_path_hint: str = "",
    *,
    extensions: tuple[str, ...] = (".xlsx", ".xls", ".pdf", ".csv"),
) -> Path:
    """Pick runtime upload for an agent; ignore LLM hints pointing at samples/outputs."""
    from src.core.agent_workspace_files import resolve_storage_path_file

    picked = pick_runtime_agent_file(list_agent_file_rows(str(agent_id), extensions=extensions), extensions=extensions)
    if picked:
        path = Path(picked.storage_path)
        if path.is_file():
            return path.resolve()

    if storage_path_hint:
        path = resolve_storage_path_file(agent_id, storage_path_hint)
        if path and is_runtime_upload_candidate(path.name, str(path), extensions=extensions):
            return path.resolve()

    raise FileNotFoundError(
        "فایل ورودی runtime برای این ایجنت یافت نشد — فایل خام را آپلود کنید (نه نمونه خروجی)."
    )
