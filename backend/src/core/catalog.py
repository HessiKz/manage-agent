"""Demo catalog slugs — production UI lists only these agents by default."""

from __future__ import annotations

from src.database.full_catalog import FULL_AGENT_CATALOG

CATALOG_SLUGS: frozenset[str] = frozenset(entry["slug"] for entry in FULL_AGENT_CATALOG)

_TEST_SLUG_PREFIXES = (
    "test-",
    "karkard-test-",
    "api-agent-",
    "karkard-dl-",
)


def is_test_agent_slug(slug: str) -> bool:
    """True for pytest / dev runs that clutter the agents list."""
    lower = slug.lower()
    if lower.startswith(_TEST_SLUG_PREFIXES):
        return True
    if len(lower) == 1 and lower.isalpha():
        return True
    return False
