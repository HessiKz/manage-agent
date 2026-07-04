"""Resolve کارکرد input paths from bare filenames or agent workspace paths."""

from __future__ import annotations

from pathlib import Path
from uuid import UUID

from src.core.agent_file_roles import is_instruction_file, is_output_sample_file
from src.karkard.input_selection import is_runtime_karkard_candidate, workbook_looks_like_raw_karkard
from src.karkard.names import is_processed_karkard_filename

AGENT_FILES_ROOT = Path("var/agent_files")


def _is_processed_karkard(path: Path) -> bool:
    return is_processed_karkard_filename(path.name)


def _is_runtime_karkard(path: Path) -> bool:
    return is_runtime_karkard_candidate(path.name, str(path))


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
        if not path.is_file() or not _is_runtime_karkard(path):
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
        if not _is_runtime_karkard(direct):
            raise FileNotFoundError(
                "فایل انتخاب‌شده نمونه خروجی یا خروجی پردازش‌شده است — فایل خام کارکرد را آپلود کنید."
            )
        if not workbook_looks_like_raw_karkard(direct):
            raise FileNotFoundError(
                "فایل انتخاب‌شده شبیه نمونه/خروجی نهایی است — فایل خام حضور و غیاب (با ستون «اضافه کار کل») را آپلود کنید."
            )
        return direct.resolve()

    for candidate in (Path.cwd() / raw, AGENT_FILES_ROOT / raw):
        if candidate.is_file():
            if not _is_runtime_karkard(candidate):
                raise FileNotFoundError(
                    "فایل انتخاب‌شده نمونه خروجی یا خروجی پردازش‌شده است — فایل خام کارکرد را آپلود کنید."
                )
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
        runtime = [p for p in matches if _is_runtime_karkard(p) and workbook_looks_like_raw_karkard(p)]
        if not runtime:
            runtime = [p for p in matches if _is_runtime_karkard(p)]
        if runtime:
            return max(runtime, key=lambda p: p.stat().st_mtime).resolve()
        raise FileNotFoundError(
            "فقط نمونه خروجی یا فایل پردازش‌شده یافت شد — فایل خام کارکرد را آپلود کنید."
        )

    raise FileNotFoundError(f"فایل کارکرد یافت نشد: {storage_path}")


def find_processed_output(input_path: Path) -> Path | None:
    """Return newest processed workbook beside the raw upload, if any."""
    parent = input_path.parent
    candidates = [p for p in parent.glob("karkard-*.xlsx") if is_processed_karkard_filename(p.name)]
    if candidates:
        return max(candidates, key=lambda p: p.stat().st_mtime)
    legacy = parent / f"karkard-{input_path.stem}-processed.xlsx"
    return legacy if legacy.is_file() else None


def resolve_locked_karkard_input(
    agent_id: str | UUID,
    storage_path_hint: str = "",
) -> Path:
    """Pick the raw attendance file for an agent; ignore wrong LLM path hints."""
    from src.karkard.input_selection import list_agent_file_rows, pick_runtime_karkard_file

    picked = pick_runtime_karkard_file(list_agent_file_rows(str(agent_id)))
    if picked:
        path = Path(picked.storage_path)
        if path.is_file():
            return path.resolve()
    if storage_path_hint:
        hint = storage_path_hint.strip()
        if hint:
            try:
                resolved = resolve_storage_path(hint, agent_id=agent_id)
                if workbook_looks_like_raw_karkard(resolved):
                    return resolved.resolve()
            except FileNotFoundError:
                pass
    raise FileNotFoundError(
        "فایل خام کارکرد (حضور و غیاب با ستون «اضافه کار کل») برای این ایجنت یافت نشد."
    )
