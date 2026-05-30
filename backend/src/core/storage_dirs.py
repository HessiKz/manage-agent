"""Ensure writable var/ directories for uploads, reports, and کارکرد output."""

from __future__ import annotations

import os
from pathlib import Path

from src.karkard.output import KARKARD_OUTPUT_DIR
from src.demo.reports import REPORTS_DIR

VAR_DIRS = (
    Path("var/agent_files"),
    REPORTS_DIR,
    KARKARD_OUTPUT_DIR,
)


def ensure_storage_dirs() -> None:
    """Create app storage dirs; permissive mode avoids Docker/root vs host uid mismatches."""
    for d in VAR_DIRS:
        d.mkdir(parents=True, exist_ok=True)
        try:
            os.chmod(d, 0o777)
        except OSError:
            pass
