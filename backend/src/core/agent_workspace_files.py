"""Resolve agent workspace paths under var/agent_files/{agent_id}/ to safe download URLs."""

from __future__ import annotations

import re
import shutil
from pathlib import Path
from urllib.parse import quote, unquote
from uuid import UUID

from src.karkard.names import is_processed_karkard_filename
from src.core.workspace_paths import (
    STORAGE_PATH_FRAGMENT_RE,
    WORKSPACE_API_PATH_RE,
    decode_workspace_rel,
    encode_workspace_rel,
    safe_output_filename,
)
from src.core.workspace_output_registry import (
    find_latest_workspace_output,
    looks_like_output_placeholder,
    reconcile_workspace_manifest,
    register_workspace_output,
    remember_placeholder_alias,
    resolve_via_manifest,
)

_AGENT_FILES_ROOT = Path("var/agent_files")

# Legacy aliases — prefer workspace_paths.WORKSPACE_API_PATH_RE / STORAGE_PATH_FRAGMENT_RE
_WORKSPACE_PATH_RE = STORAGE_PATH_FRAGMENT_RE
_WORKSPACE_URL_RE = WORKSPACE_API_PATH_RE


def agent_workspace_root(agent_id: UUID | str) -> Path:
    return (_AGENT_FILES_ROOT / str(agent_id)).resolve()


def resolve_workspace_file(agent_id: UUID | str, relative_path: str) -> Path | None:
    """Return absolute path if relative_path stays inside the agent workspace."""
    root = agent_workspace_root(agent_id)
    rel = relative_path.strip().lstrip("/\\")
    if not rel or ".." in Path(rel).parts:
        return None
    candidate = (root / rel).resolve()
    try:
        candidate.relative_to(root)
    except ValueError:
        return None
    return candidate if candidate.is_file() else None


def _karkard_output_dir() -> Path:
    from src.karkard.output import KARKARD_OUTPUT_DIR

    return KARKARD_OUTPUT_DIR


def find_file_by_basename(agent_id: UUID | str, name: str) -> Path | None:
    """Search agent workspace by exact basename only (no shared-dir guessing)."""
    basename = Path((name or "").strip().lstrip("/\\")).name
    if not basename or basename != (name or "").strip().lstrip("/\\"):
        return None

    root = agent_workspace_root(agent_id)
    if not root.is_dir():
        return None
    matches = [p for p in root.rglob(basename) if p.is_file()]
    if not matches:
        return None
    return max(matches, key=lambda p: p.stat().st_mtime)


def resolve_storage_path_file(agent_id: UUID | str, storage_path: str) -> Path | None:
    """Resolve a stored storage_path (absolute or var/agent_files/...) to a file."""
    raw = (storage_path or "").strip()
    if not raw:
        return None
    p = Path(raw)
    root = agent_workspace_root(agent_id)
    if p.is_absolute():
        try:
            p = p.resolve()
            p.relative_to(root)
            return p if p.is_file() else None
        except ValueError:
            pass
    else:
        norm = raw.replace("\\", "/")
        if norm.startswith("var/agent_files/"):
            parts = Path(norm).parts
            if len(parts) >= 4 and parts[2] == str(agent_id):
                rel = "/".join(parts[3:])
                found = resolve_workspace_file(agent_id, rel)
                if found:
                    return found
        found = resolve_workspace_file(agent_id, raw)
        if found:
            return found

    return find_file_by_basename(agent_id, Path(raw).name)


def _relative_workspace_path(agent_id: UUID | str, storage_path: str) -> str | None:
    """Best-effort relative path for URL building when the file may not exist yet."""
    raw = (storage_path or "").strip().replace("\\", "/")
    if not raw:
        return None
    if raw.startswith("var/agent_files/"):
        parts = Path(raw).parts
        if len(parts) >= 4 and parts[2] == str(agent_id):
            rel = "/".join(parts[3:])
            if ".." not in Path(rel).parts:
                return rel
    root = agent_workspace_root(agent_id)
    p = Path(raw)
    if p.is_absolute():
        try:
            return p.resolve().relative_to(root).as_posix()
        except ValueError:
            return None
    rel = raw.lstrip("/")
    if ".." in Path(rel).parts:
        return None
    return rel


def find_latest_karkard_processed(agent_id: UUID | str) -> Path | None:
    """Newest karkard output under agent workspace or shared karkard output dir."""
    candidates: list[Path] = []
    root = agent_workspace_root(agent_id)
    if root.is_dir():
        candidates.extend(
            p for p in root.rglob("*.xlsx") if p.is_file() and is_processed_karkard_filename(p.name)
        )
    kdir = _karkard_output_dir()
    if kdir.is_dir():
        candidates.extend(
            p for p in kdir.rglob("*.xlsx") if p.is_file() and is_processed_karkard_filename(p.name)
        )
    if not candidates:
        return None
    return max(candidates, key=lambda p: p.stat().st_mtime)


def _ensure_inside_workspace(agent_id: UUID | str, path: Path) -> Path:
    root = agent_workspace_root(agent_id)
    try:
        path.resolve().relative_to(root)
        return path
    except ValueError:
        return mirror_output_to_workspace(agent_id, path)


def resolve_workspace_download_path(agent_id: UUID | str, file_path: str) -> Path | None:
    """Resolve workspace download path — never substitute a different file silently."""
    requested = decode_workspace_rel(file_path)
    if not requested:
        return None

    via_manifest = resolve_via_manifest(_AGENT_FILES_ROOT, agent_id, requested)
    if via_manifest:
        return via_manifest

    direct = resolve_workspace_file(agent_id, requested)
    if direct:
        register_workspace_output(_AGENT_FILES_ROOT, agent_id, direct)
        return direct

    # Bare filename only — no path segments (avoid matching truncated/wrong URLs).
    if "/" not in requested and "\\" not in requested:
        by_name = find_file_by_basename(agent_id, requested)
        if by_name:
            resolved = _ensure_inside_workspace(agent_id, by_name)
            register_workspace_output(_AGENT_FILES_ROOT, agent_id, resolved, aliases=[requested])
            return resolved

    if looks_like_output_placeholder(requested):
        latest = find_latest_workspace_output(_AGENT_FILES_ROOT, agent_id)
        if not latest:
            latest = find_latest_karkard_processed(agent_id)
        if latest:
            resolved = _ensure_inside_workspace(agent_id, latest)
            remember_placeholder_alias(_AGENT_FILES_ROOT, agent_id, requested, resolved)
            return resolved

    return None


def mirror_output_to_workspace(agent_id: UUID | str, processed: Path, *, kind: str = "output") -> Path:
    """Copy a generated file into agent workspace under output/ with a URL-safe name."""
    root = agent_workspace_root(agent_id)
    out_dir = root / "output"
    out_dir.mkdir(parents=True, exist_ok=True)
    name = processed.name
    if " " in name or not name.isascii():
        name = safe_output_filename(kind, processed.suffix or ".bin")
    dest = out_dir / name
    if processed.resolve() != dest.resolve():
        shutil.copy2(processed, dest)
    register_workspace_output(
        _AGENT_FILES_ROOT,
        agent_id,
        dest,
        kind=kind,
        aliases=["latest", f"output/{dest.name}"],
    )
    return dest


def mirror_karkard_output_to_workspace(agent_id: UUID | str, processed: Path) -> Path:
    """Copy processed کارکرد file beside uploads so workspace download URLs resolve."""
    dest = mirror_output_to_workspace(agent_id, processed)
    register_workspace_output(
        _AGENT_FILES_ROOT,
        agent_id,
        dest,
        kind="karkard",
        aliases=[
            "karkard/processed.xlsx",
            f"karkard-{processed.stem.split('-', 1)[-1]}/processed.xlsx"
            if processed.name.startswith("karkard-")
            else "karkard/processed.xlsx",
        ],
    )
    return dest


def _encode_workspace_rel(rel: str) -> str:
    return encode_workspace_rel(rel)


def workspace_download_url(agent_id: UUID | str, storage_path: str) -> str | None:
    """Public API path for a file inside the agent workspace."""
    path = resolve_storage_path_file(agent_id, storage_path)
    if path:
        root = agent_workspace_root(agent_id)
        rel = path.relative_to(root).as_posix()
        return f"/api/v1/agents/{agent_id}/workspace/{_encode_workspace_rel(rel)}"

    rel = _relative_workspace_path(agent_id, storage_path)
    if rel:
        return f"/api/v1/agents/{agent_id}/workspace/{_encode_workspace_rel(rel)}"
    return None


def canonical_workspace_download_url(agent_id: UUID | str, file_path: Path | str) -> str | None:
    """Register a generated file and return a stable workspace download URL."""
    path = Path(file_path)
    if not path.is_file():
        path = resolve_storage_path_file(agent_id, str(file_path)) or path
    if not path.is_file():
        return workspace_download_url(agent_id, str(file_path))

    rel = register_workspace_output(_AGENT_FILES_ROOT, agent_id, path) or _relative_workspace_path(
        agent_id, str(path)
    )
    if not rel:
        return None
    return f"/api/v1/agents/{agent_id}/workspace/{_encode_workspace_rel(rel)}"


def repair_workspace_urls_in_text(text: str, agent_id: UUID | str) -> str:
    """Re-encode workspace URLs; never rewrite a URL to a different file."""

    def _sub(match: re.Match[str]) -> str:
        aid = match.group(1)
        if str(aid) != str(agent_id):
            return match.group(0)
        rel = decode_workspace_rel(match.group(2))
        if resolve_workspace_file(agent_id, rel):
            encoded = encode_workspace_rel(rel)
            if encoded != match.group(2):
                return f"/api/v1/agents/{agent_id}/workspace/{encoded}"
        return match.group(0)

    return WORKSPACE_API_PATH_RE.sub(_sub, text or "")


def linkify_workspace_paths(text: str, agent_id: UUID | str) -> str:
    """Replace raw var/agent_files/... paths in assistant text with download URLs."""

    def _sub(match: re.Match[str]) -> str:
        aid = match.group(1)
        if str(aid) != str(agent_id):
            return match.group(0)
        rel = match.group(2).replace("\\", "/")
        url = workspace_download_url(agent_id, rel)
        return url or match.group(0)

    return _WORKSPACE_PATH_RE.sub(_sub, text or "")


def finalize_agent_output_text(text: str, agent_id: UUID | str) -> str:
    """Normalize assistant output links: storage paths → URLs, then repair broken workspace URLs."""
    text = linkify_workspace_paths(text, agent_id)
    text = repair_workspace_urls_in_text(text, agent_id)
    return text


def list_workspace_output_files(agent_id: UUID | str, *, limit: int = 5) -> list[Path]:
    """Recent tool-generated exports (output/ folder + processed karkard xlsx in workspace)."""
    reconcile_workspace_manifest(_AGENT_FILES_ROOT, agent_id)
    root = agent_workspace_root(agent_id)
    if not root.is_dir():
        return []
    files: list[Path] = []
    out_dir = root / "output"
    if out_dir.is_dir():
        files.extend(p for p in out_dir.iterdir() if p.is_file())
    files.extend(
        p
        for p in root.rglob("*.xlsx")
        if p.is_file() and is_processed_karkard_filename(p.name)
    )
    files.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    seen: set[str] = set()
    unique: list[Path] = []
    for p in files:
        if p.name in seen:
            continue
        seen.add(p.name)
        unique.append(p)
    return unique[:limit]
