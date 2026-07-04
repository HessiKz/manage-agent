"""کارکرد output filename patterns."""

from __future__ import annotations

import re

_PROCESSED_KARKARD_RE = re.compile(r"^karkard-(?:[0-9a-f]{8}|.+?-processed)\.xlsx$", re.IGNORECASE)


def is_processed_karkard_filename(name: str) -> bool:
    lower = name.lower()
    if lower == "processed.xlsx":
        return True
    return bool(_PROCESSED_KARKARD_RE.match(lower))
