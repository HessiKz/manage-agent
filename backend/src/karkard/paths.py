"""Resolve کارکرد input paths from bare filenames or agent workspace paths."""

from __future__ import annotations

from pathlib import Path
from uuid import UUID

AGENT_FILES_ROOT = Path("var/agent_files")


def _basename_matches(filename: str, query: str) -> bool:
    if filename == query:
        return True
    return filename.endswith(f"_{query}")


def _collect_candidates(root: Path, query: str) -> list[Path]:
    if not root.is_dir():
        return []
    basename = Path(query).name
    found: list[Path] = []
    for path in root.rglob("*.xlsx"):
        if not path.is_file():
            continue
        if path.name.startswith("karkard-") and path.name.endswith("-processed.xlsx"):
            continue
        if _basename_matches(path.name, basename):
            found.append(path)
    return found


def resolve_storage_path(
    storage_path: str,
    *,
    agent_id: str | UUID | None = None,
) -> Path:
    """Find the real uploaded .xlsx when the LLM passes only a display filename."""
    raw = (storage_path or "").strip()
    if not raw:
        raise FileNotFoundError("مسیر فایل کارکرد خالی است")

    direct = Path(raw)
    if direct.is_file():
        return direct.resolve()

    for candidate in (Path.cwd() / raw, AGENT_FILES_ROOT / raw):
        if candidate.is_file():
            return candidate.resolve()

    basename = Path(raw).name
    matches: list[Path] = []
    if agent_id:
        agent_root = AGENT_FILES_ROOT / str(agent_id)
        if agent_root.is_dir():
            matches = _collect_candidates(agent_root, basename)
    if not matches and AGENT_FILES_ROOT.is_dir():
        matches = _collect_candidates(AGENT_FILES_ROOT, basename)

    if matches:
        return max(matches, key=lambda p: p.stat().st_mtime).resolve()

    raise FileNotFoundError(f"فایل کارکرد یافت نشد: {storage_path}")


def find_processed_output(input_path: Path) -> Path | None:
    """Return existing processed workbook beside the raw upload, if any."""
    out_name = f"karkard-{input_path.stem}-processed.xlsx"
    out_path = input_path.parent / out_name
    return out_path if out_path.is_file() else None
