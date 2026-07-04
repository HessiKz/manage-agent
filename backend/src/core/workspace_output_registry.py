"""Persistent registry of agent tool outputs — survives deploys and LLM path hallucinations."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any
from uuid import UUID

_MANIFEST_NAME = ".workspace-outputs.json"
_MANIFEST_VERSION = 1

# Paths LLMs invent that should map to the newest registered output.
_PLACEHOLDER_RE = re.compile(
    r"^(?:output/)?"
    r"(?:latest(?:[-_]?output)?(?:\.xlsx)?|processed\.xlsx|result\.xlsx|output\.xlsx)$",
    re.IGNORECASE,
)
_KARKARD_PLACEHOLDER_RE = re.compile(
    r"^karkard-[a-zA-Z0-9]{6,}/processed\.xlsx$",
    re.IGNORECASE,
)


def _agent_root(agent_files_root: Path, agent_id: UUID | str) -> Path:
    return (agent_files_root / str(agent_id)).resolve()


def _manifest_path(agent_files_root: Path, agent_id: UUID | str) -> Path:
    return _agent_root(agent_files_root, agent_id) / _MANIFEST_NAME


def _load_manifest(agent_files_root: Path, agent_id: UUID | str) -> dict[str, Any]:
    path = _manifest_path(agent_files_root, agent_id)
    if not path.is_file():
        return {"version": _MANIFEST_VERSION, "outputs": [], "latest": None}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"version": _MANIFEST_VERSION, "outputs": [], "latest": None}
    if not isinstance(data, dict):
        return {"version": _MANIFEST_VERSION, "outputs": [], "latest": None}
    data.setdefault("outputs", [])
    data.setdefault("latest", None)
    return data


def _save_manifest(agent_files_root: Path, agent_id: UUID | str, data: dict[str, Any]) -> None:
    root = _agent_root(agent_files_root, agent_id)
    root.mkdir(parents=True, exist_ok=True)
    path = _manifest_path(agent_files_root, agent_id)
    payload = {
        "version": _MANIFEST_VERSION,
        "outputs": data.get("outputs") or [],
        "latest": data.get("latest"),
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _norm_alias(value: str) -> str:
    return (value or "").strip().replace("\\", "/").lstrip("/")


def _rel_under_agent(agent_files_root: Path, agent_id: UUID | str, file_path: Path) -> str | None:
    root = _agent_root(agent_files_root, agent_id)
    try:
        return file_path.resolve().relative_to(root).as_posix()
    except ValueError:
        return None


def _output_globs(root: Path) -> list[Path]:
    if not root.is_dir():
        return []
    seen: set[Path] = set()
    found: list[Path] = []
    out_dir = root / "output"
    if out_dir.is_dir():
        for p in out_dir.iterdir():
            if p.is_file():
                key = p.resolve()
                if key not in seen:
                    seen.add(key)
                    found.append(p)
    patterns = (
        "karkard-*-processed.xlsx",
        "*-processed.xlsx",
        "*-output.xlsx",
        "*-report.pdf",
        "*-report.xlsx",
    )
    for pattern in patterns:
        for p in root.glob(pattern):
            if not p.is_file():
                continue
            key = p.resolve()
            if key in seen:
                continue
            seen.add(key)
            found.append(p)
    return found


def register_workspace_output(
    agent_files_root: Path,
    agent_id: UUID | str,
    file_path: Path,
    *,
    aliases: list[str] | None = None,
    kind: str = "output",
) -> str | None:
    """Record a generated file and optional aliases; returns workspace-relative path."""
    if not file_path.is_file():
        return None
    rel = _rel_under_agent(agent_files_root, agent_id, file_path)
    if not rel:
        return None

    manifest = _load_manifest(agent_files_root, agent_id)
    outputs: list[dict[str, Any]] = list(manifest.get("outputs") or [])
    alias_set = {_norm_alias(rel), "latest", f"output/{Path(rel).name}"}
    for alias in aliases or []:
        alias_set.add(_norm_alias(alias))
    alias_set.discard("")

    mtime = file_path.stat().st_mtime
    entry = next((o for o in outputs if o.get("rel") == rel), None)
    if entry:
        entry["mtime"] = mtime
        entry["kind"] = kind
        entry["aliases"] = sorted(set(entry.get("aliases") or []) | alias_set)
    else:
        entry = {
            "rel": rel,
            "aliases": sorted(alias_set),
            "kind": kind,
            "mtime": mtime,
        }
        outputs.append(entry)

    manifest["outputs"] = outputs
    manifest["latest"] = rel
    _save_manifest(agent_files_root, agent_id, manifest)
    return rel


def reconcile_workspace_manifest(agent_files_root: Path, agent_id: UUID | str) -> int:
    """Scan disk and refresh manifest entries for known output files."""
    root = _agent_root(agent_files_root, agent_id)
    count = 0
    for path in _output_globs(root):
        if register_workspace_output(agent_files_root, agent_id, path):
            count += 1
    return count


def resolve_via_manifest(
    agent_files_root: Path,
    agent_id: UUID | str,
    requested: str,
) -> Path | None:
    """Resolve a requested workspace path through aliases / latest pointer."""
    key = _norm_alias(requested)
    if not key:
        return None

    manifest = _load_manifest(agent_files_root, agent_id)
    root = _agent_root(agent_files_root, agent_id)

    for entry in manifest.get("outputs") or []:
        rel = entry.get("rel")
        if not rel:
            continue
        aliases = {_norm_alias(rel), *(_norm_alias(a) for a in entry.get("aliases") or [])}
        if key in aliases:
            candidate = root / rel
            if candidate.is_file():
                return candidate.resolve()

    latest = manifest.get("latest")
    if latest and key in {"latest", "output/latest", "processed.xlsx", "output/processed.xlsx"}:
        candidate = root / str(latest)
        if candidate.is_file():
            return candidate.resolve()
    return None


def looks_like_output_placeholder(file_path: str) -> bool:
    norm = _norm_alias(file_path)
    if not norm:
        return False
    if _PLACEHOLDER_RE.match(norm):
        return True
    if _KARKARD_PLACEHOLDER_RE.match(norm):
        return True
    return False


def find_latest_workspace_output(agent_files_root: Path, agent_id: UUID | str) -> Path | None:
    """Newest tool output under the agent workspace."""
    manifest = _load_manifest(agent_files_root, agent_id)
    root = _agent_root(agent_files_root, agent_id)

    latest_rel = manifest.get("latest")
    if latest_rel:
        candidate = root / str(latest_rel)
        if candidate.is_file():
            return candidate.resolve()

    candidates = _output_globs(root)
    if not candidates:
        return None
    return max(candidates, key=lambda p: p.stat().st_mtime).resolve()


def remember_placeholder_alias(
    agent_files_root: Path,
    agent_id: UUID | str,
    placeholder: str,
    resolved: Path,
) -> None:
    """Bind a hallucinated path to a real file so repeat downloads stay stable."""
    register_workspace_output(
        agent_files_root,
        agent_id,
        resolved,
        aliases=[placeholder],
    )


def reconcile_all_agent_manifests(agent_files_root: Path) -> int:
    """Refresh manifests for every agent workspace on disk."""
    if not agent_files_root.is_dir():
        return 0
    total = 0
    for child in agent_files_root.iterdir():
        if child.is_dir():
            total += reconcile_workspace_manifest(agent_files_root, child.name)
    return total
