"""Tests for agent workspace path → download URL helpers."""

from pathlib import Path
from uuid import uuid4

from src.core.agent_workspace_files import (
    finalize_agent_output_text,
    linkify_workspace_paths,
    resolve_workspace_download_path,
    resolve_workspace_file,
    workspace_download_url,
)


def test_workspace_download_url_relative():
    agent_id = uuid4()
    rel = "output/report.xlsx"
    root = Path("var/agent_files") / str(agent_id)
    root.mkdir(parents=True, exist_ok=True)
    (root / "output").mkdir(exist_ok=True)
    f = root / "output" / "report.xlsx"
    f.write_bytes(b"xlsx")

    url = workspace_download_url(agent_id, str(f))
    assert url == f"/api/v1/agents/{agent_id}/workspace/output/report.xlsx"
    assert resolve_workspace_file(agent_id, "output/report.xlsx") == f.resolve()


def test_workspace_download_url_encodes_spaces(tmp_path, monkeypatch):
    agent_id = uuid4()
    root = tmp_path / "var" / "agent_files" / str(agent_id)
    root.mkdir(parents=True)
    f = root / "karkard-bb39_کارکرد توسعه.xlsx"
    f.write_bytes(b"xlsx")

    monkeypatch.setattr("src.core.agent_workspace_files._AGENT_FILES_ROOT", tmp_path / "var" / "agent_files")

    url = workspace_download_url(agent_id, str(f))
    assert " " not in url
    assert "%20" in url or "%D9" in url
    assert resolve_workspace_download_path(agent_id, url.split("/workspace/", 1)[1]) == f.resolve()


def test_linkify_workspace_paths():
    agent_id = uuid4()
    raw = f"var/agent_files/{agent_id}/output/کارکرد.xlsx"
    out = linkify_workspace_paths(f"مسیر: {raw}", agent_id)
    assert f"/api/v1/agents/{agent_id}/workspace/output/" in out
    assert "var/agent_files" not in out


def test_linkify_workspace_paths_without_file_on_disk():
    agent_id = uuid4()
    raw = f"var/agent_files/{agent_id}/output/pending.xlsx"
    out = finalize_agent_output_text(f"مسیر: {raw}", agent_id)
    assert f"/api/v1/agents/{agent_id}/workspace/output/pending.xlsx" in out
    assert "var/agent_files" not in out


def test_resolve_workspace_download_hallucinated_karkard_path(tmp_path, monkeypatch):
    agent_id = uuid4()
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(
        "src.core.agent_workspace_files._AGENT_FILES_ROOT",
        tmp_path / "var" / "agent_files",
    )
    monkeypatch.setattr("src.karkard.output.KARKARD_OUTPUT_DIR", tmp_path / "var" / "karkard_output")

    root = tmp_path / "var" / "agent_files" / str(agent_id)
    root.mkdir(parents=True)
    processed = root / "karkard-demo-karkard-raw-processed.xlsx"
    processed.write_bytes(b"xlsx")

    fake_llm_path = "karkard-86c0d1b11cfb48a1bec038c35a2fbfc0/processed.xlsx"
    assert resolve_workspace_download_path(agent_id, fake_llm_path) == processed.resolve()


def test_resolve_workspace_download_finds_file_in_agent_workspace(tmp_path, monkeypatch):
    agent_id = uuid4()
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(
        "src.core.agent_workspace_files._AGENT_FILES_ROOT",
        tmp_path / "var" / "agent_files",
    )

    root = tmp_path / "var" / "agent_files" / str(agent_id)
    root.mkdir(parents=True)
    processed = root / "output" / "karkard-abc.xlsx"
    processed.parent.mkdir(parents=True)
    processed.write_bytes(b"xlsx")

    resolved = resolve_workspace_download_path(agent_id, "output/karkard-abc.xlsx")
    assert resolved is not None
    assert resolved.name == processed.name
