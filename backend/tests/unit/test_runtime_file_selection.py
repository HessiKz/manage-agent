"""Platform runtime file selection — samples and outputs must never win."""

from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest

from src.core.runtime_file_selection import (
    is_generated_output_filename,
    is_runtime_upload_candidate,
    pick_runtime_agent_file,
    resolve_locked_runtime_file,
)


def test_generated_output_filename_detected():
    assert is_generated_output_filename("karkard-deadbeef.xlsx")
    assert is_generated_output_filename("output-cafebabe.pdf")
    assert not is_generated_output_filename("کارکرد توسعه کارآفرینی-2.1405.xlsx")


def test_runtime_candidate_rejects_sample_and_output():
    assert not is_runtime_upload_candidate(
        "output-sample__expected.xlsx",
        f"/tmp/{uuid4().hex}_output-sample__expected.xlsx",
    )
    assert not is_runtime_upload_candidate("karkard-deadbeef.xlsx", "/tmp/karkard-deadbeef.xlsx")
    assert is_runtime_upload_candidate(
        "کارکرد توسعه کارآفرینی-2.1405.xlsx",
        extensions=(".xlsx",),
    )


def test_pick_runtime_prefers_raw_over_sample(tmp_path, monkeypatch):
    monkeypatch.setattr(
        "src.core.runtime_file_selection._AGENT_FILES_ROOT",
        tmp_path / "var" / "agent_files",
    )
    agent_id = uuid4()
    agent_dir = tmp_path / "var" / "agent_files" / str(agent_id)
    agent_dir.mkdir(parents=True)
    sample = agent_dir / f"{uuid4().hex}_output-sample__expected.xlsx"
    raw = agent_dir / f"{uuid4().hex}_raw-input.xlsx"
    sample.write_bytes(b"s")
    raw.write_bytes(b"r")

    rows = [
        SimpleNamespace(filename="output-sample__expected.xlsx", storage_path=str(sample)),
        SimpleNamespace(filename="raw-input.xlsx", storage_path=str(raw)),
    ]
    picked = pick_runtime_agent_file(rows)
    assert picked is not None
    assert picked.storage_path == str(raw)


def test_resolve_locked_ignores_sample_hint(tmp_path, monkeypatch):
    monkeypatch.setattr(
        "src.core.runtime_file_selection._AGENT_FILES_ROOT",
        tmp_path / "var" / "agent_files",
    )
    agent_id = uuid4()
    agent_dir = tmp_path / "var" / "agent_files" / str(agent_id)
    agent_dir.mkdir(parents=True)
    sample = agent_dir / f"{uuid4().hex}_output-sample__expected.xlsx"
    raw = agent_dir / f"{uuid4().hex}_raw-input.xlsx"
    sample.write_bytes(b"s")
    raw.write_bytes(b"r")

    resolved = resolve_locked_runtime_file(str(agent_id), str(sample), extensions=(".xlsx",))
    assert resolved == raw.resolve()
