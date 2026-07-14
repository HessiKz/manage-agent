"""Failure ledger pure-helper tests (privacy redaction + pattern hashing).

DB-backed record/relevant/top require a live DB and are exercised via the
API integration suite; here we validate the privacy and dedup invariants.
"""

from __future__ import annotations

from src.services.failure_ledger_service import (
    normalize_error,
    pattern_hash,
    redact,
    to_regex,
)
from src.models.failure_ledger import FailureRootCauseTag


def test_redact_email():
    out = redact("error at user@example.com failed")
    assert "user@example.com" not in out
    assert "[email]" in out


def test_redact_secret():
    out = redact("password= hunter2; token= abc")
    assert "hunter2" not in out
    assert "abc" not in out
    assert "[redacted]" in out


def test_redact_truncates_to_200():
    out = redact("x" * 500)
    assert len(out) <= 200


def test_pattern_hash_dedup_same_inputs():
    tag = FailureRootCauseTag.WIDGET_DISABLED
    h1 = pattern_hash(tag, "Button disabled", "support", "click_tool")
    h2 = pattern_hash(tag, "button  disabled", "support", "click_tool")
    # whitespace-tolerant
    assert h1 == h2 == pattern_hash(tag, "Button Disabled", "support", "click_tool")


def test_pattern_hash_differs_by_tag():
    h1 = pattern_hash(FailureRootCauseTag.WIDGET_DISABLED, "err", None, None)
    h2 = pattern_hash(FailureRootCauseTag.NETWORK, "err", None, None)
    assert h1 != h2


def test_normalize_error():
    assert normalize_error("  Foo   Bar  ") == "foo bar"


def test_to_regex_collapses_whitespace():
    regex = to_regex("some   spaced error")
    assert "some" in regex and "error" in regex


def test_sandbox_tags_present():
    """Sanbox_* root causes must exist for sandbox failure recording."""
    for t in (
        FailureRootCauseTag.SANDBOX_OOM,
        FailureRootCauseTag.SANDBOX_TIMEOUT,
        FailureRootCauseTag.SANDBOX_IMPORT_DENIED,
        FailureRootCauseTag.SANDBOX_EMPTY_OUTPUT,
        FailureRootCauseTag.SANDBOX_PARTIAL,
    ):
        assert t.value.startswith("sandbox_")
