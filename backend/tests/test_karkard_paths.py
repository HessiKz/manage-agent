"""Path resolution for کارکرد uploads."""

from __future__ import annotations

from pathlib import Path

import pytest

from src.karkard.paths import find_processed_output, resolve_storage_path

FIXTURE = Path(__file__).resolve().parent / "fixtures/karkard_sample.xlsx"


@pytest.mark.skipif(not FIXTURE.is_file(), reason="fixture missing")
def test_resolve_bare_demo_filename(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("src.karkard.paths.AGENT_FILES_ROOT", tmp_path)
    agent_dir = tmp_path / "agent-1"
    agent_dir.mkdir()
    stored = agent_dir / "bb565910_demo-karkard-raw.xlsx"
    stored.write_bytes(FIXTURE.read_bytes())

    resolved = resolve_storage_path("demo-karkard-raw.xlsx", agent_id="agent-1")
    assert resolved == stored.resolve()


def test_find_processed_output(tmp_path: Path):
    raw = tmp_path / "abc_raw.xlsx"
    raw.write_bytes(b"x")
    out = tmp_path / "karkard-deadbeef.xlsx"
    out.write_bytes(b"y")
    assert find_processed_output(raw) == out
