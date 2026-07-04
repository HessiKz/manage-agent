"""Platform-wide agent tool file pipeline."""

from __future__ import annotations

from pathlib import Path
from uuid import uuid4

import pytest

from src.core.agent_file_roles import OUTPUT_SAMPLE_PREFIX
from src.core.agent_tool_files import (
    lock_tool_storage_path,
    prepare_tool_input_path,
    resolve_agent_reference_path,
    run_with_file_pipeline,
    tool_accepts_storage_path,
    wrap_tool_with_file_pipeline,
)


def test_resolve_agent_reference_finds_output_sample(tmp_path: Path, monkeypatch):
    agent_id = uuid4().hex
    root = tmp_path / "var" / "agent_files" / agent_id
    root.mkdir(parents=True)
    sample = root / f"{uuid4().hex}_{OUTPUT_SAMPLE_PREFIX}expected.xlsx"
    sample.write_bytes(b"x")
    monkeypatch.chdir(tmp_path)
    assert resolve_agent_reference_path(agent_id) == sample.resolve()


def test_lock_tool_storage_path_rejects_sample(tmp_path: Path, monkeypatch):
    agent_id = uuid4().hex
    root = tmp_path / "var" / "agent_files" / agent_id
    root.mkdir(parents=True)
    raw = root / f"{uuid4().hex}_data.csv"
    raw.write_text("a,b\n1,2\n")
    sample = root / f"{uuid4().hex}_{OUTPUT_SAMPLE_PREFIX}expected.csv"
    sample.write_text("x,y\n")
    monkeypatch.chdir(tmp_path)

    locked = lock_tool_storage_path(agent_id, str(sample))
    assert locked.name.endswith("_data.csv")


def test_resolve_agent_reference_ignores_bundled_without_sample():
    assert resolve_agent_reference_path("any-agent", tool_slug="karkard_process") is None


def test_run_with_file_pipeline_invokes_without_storage_path():
    calls: list[dict] = []

    def fake_invoke(args):
        calls.append(args)
        return {"ok": True}

    out = run_with_file_pipeline(None, "hr_lookup", fake_invoke, args={"employee_id": "E-1"})
    assert out == {"ok": True}
    assert calls == [{"employee_id": "E-1"}]


def test_wrap_tool_skips_non_file_tools():
    import src.agents_lib.custom_tools  # noqa: F401
    from src.agents_lib.tool_registry import ToolRegistry

    hr = ToolRegistry.get("hr_lookup")
    assert wrap_tool_with_file_pipeline("hr_lookup", hr) is hr


def test_tool_accepts_storage_path_karkard():
    import src.agents_lib.custom_tools  # noqa: F401
    from src.agents_lib.tool_registry import ToolRegistry

    assert tool_accepts_storage_path(ToolRegistry.get("karkard_process"))
    assert not tool_accepts_storage_path(ToolRegistry.get("hr_lookup"))
