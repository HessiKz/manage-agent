"""Karkard demo fixture helpers (no auto-process; scripts own processing)."""

from __future__ import annotations

from pathlib import Path


def _karkard_fixture_paths() -> list[Path]:
    backend_root = Path(__file__).resolve().parents[2]
    repo_root = backend_root.parent
    return [
        repo_root / "formdocs" / "کارکرد_توسعه_کارآفرینی_1405.2.xlsx",
        repo_root / "frontend" / "public" / "samples" / "karkard-raw.xlsx",
        backend_root / "tests" / "fixtures" / "karkard_sample.xlsx",
    ]


def resolve_karkard_fixture() -> Path | None:
    for path in _karkard_fixture_paths():
        if path.is_file():
            return path
    return None
