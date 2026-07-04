"""Workspace output manifest — aliases, placeholders, reconciliation."""

from pathlib import Path
from uuid import uuid4

from src.core.agent_workspace_files import (
    canonical_workspace_download_url,
    finalize_agent_output_text,
    repair_workspace_urls_in_text,
    resolve_workspace_download_path,
)
from src.core.workspace_output_registry import (
    register_workspace_output,
    reconcile_workspace_manifest,
    resolve_via_manifest,
)


def test_register_and_resolve_latest_alias(tmp_path, monkeypatch):
    agent_id = uuid4()
    root = tmp_path / "var" / "agent_files"
    monkeypatch.setattr("src.core.agent_workspace_files._AGENT_FILES_ROOT", root)

    agent_dir = root / str(agent_id)
    agent_dir.mkdir(parents=True)
    processed = agent_dir / "karkard-demo-processed.xlsx"
    processed.write_bytes(b"xlsx")

    register_workspace_output(root, agent_id, processed, aliases=["processed.xlsx"])

    assert resolve_via_manifest(root, agent_id, "latest") == processed.resolve()
    assert resolve_via_manifest(root, agent_id, "processed.xlsx") == processed.resolve()
    assert resolve_workspace_download_path(agent_id, "latest") == processed.resolve()


def test_hallucinated_karkard_path_remembered(tmp_path, monkeypatch):
    agent_id = uuid4()
    root = tmp_path / "var" / "agent_files"
    monkeypatch.setattr("src.core.agent_workspace_files._AGENT_FILES_ROOT", root)
    monkeypatch.setattr("src.karkard.output.KARKARD_OUTPUT_DIR", tmp_path / "karkard")

    agent_dir = root / str(agent_id)
    agent_dir.mkdir(parents=True)
    processed = agent_dir / "karkard-raw-processed.xlsx"
    processed.write_bytes(b"xlsx")

    fake = "karkard-deadbeefcafe/processed.xlsx"
    resolved = resolve_workspace_download_path(agent_id, fake)
    assert resolved == processed.resolve()

    # Second hit should use manifest alias without re-scanning heuristics.
    assert resolve_via_manifest(root, agent_id, fake) == processed.resolve()


def test_repair_workspace_urls_does_not_substitute_wrong_file(tmp_path, monkeypatch):
    agent_id = uuid4()
    root = tmp_path / "var" / "agent_files"
    monkeypatch.setattr("src.core.agent_workspace_files._AGENT_FILES_ROOT", root)

    agent_dir = root / str(agent_id)
    agent_dir.mkdir(parents=True)
    processed = agent_dir / "report-final.xlsx"
    processed.write_bytes(b"xlsx")
    register_workspace_output(root, agent_id, processed)

    broken = (
        f"دانلود: /api/v1/agents/{agent_id}/workspace/karkard-fakehash/processed.xlsx"
    )
    fixed = repair_workspace_urls_in_text(broken, agent_id)
    assert fixed == broken


def test_repair_workspace_urls_reencodes_spaced_path(tmp_path, monkeypatch):
    agent_id = uuid4()
    root = tmp_path / "var" / "agent_files"
    monkeypatch.setattr("src.core.agent_workspace_files._AGENT_FILES_ROOT", root)

    agent_dir = root / str(agent_id)
    agent_dir.mkdir(parents=True)
    f = agent_dir / "output" / "کارکرد تست.xlsx"
    f.parent.mkdir(parents=True)
    f.write_bytes(b"xlsx")

    raw_url = f"/api/v1/agents/{agent_id}/workspace/output/کارکرد تست.xlsx"
    fixed = repair_workspace_urls_in_text(f"لینک: {raw_url}", agent_id)
    assert "%" in fixed
    assert resolve_workspace_download_path(agent_id, "output/کارکرد تست.xlsx") == f.resolve()


def test_finalize_agent_output_text_linkifies_and_repairs(tmp_path, monkeypatch):
    agent_id = uuid4()
    root = tmp_path / "var" / "agent_files"
    monkeypatch.setattr("src.core.agent_workspace_files._AGENT_FILES_ROOT", root)

    agent_dir = root / str(agent_id)
    (agent_dir / "output").mkdir(parents=True)
    out = agent_dir / "output" / "کارکرد.xlsx"
    out.write_bytes(b"xlsx")

    raw = f"var/agent_files/{agent_id}/output/کارکرد.xlsx"
    text = finalize_agent_output_text(f"فایل: {raw}", agent_id)
    assert f"/api/v1/agents/{agent_id}/workspace/output/" in text
    assert "var/agent_files" not in text


def test_canonical_workspace_download_url_registers(tmp_path, monkeypatch):
    agent_id = uuid4()
    root = tmp_path / "var" / "agent_files"
    monkeypatch.setattr("src.core.agent_workspace_files._AGENT_FILES_ROOT", root)

    agent_dir = root / str(agent_id)
    agent_dir.mkdir(parents=True)
    f = agent_dir / "output.xlsx"
    f.write_bytes(b"data")

    url = canonical_workspace_download_url(agent_id, f)
    assert url == f"/api/v1/agents/{agent_id}/workspace/output.xlsx"
    assert resolve_via_manifest(root, agent_id, "latest") == f.resolve()


def test_reconcile_workspace_manifest(tmp_path, monkeypatch):
    agent_id = uuid4()
    root = tmp_path / "var" / "agent_files"
    monkeypatch.setattr("src.core.agent_workspace_files._AGENT_FILES_ROOT", root)

    agent_dir = root / str(agent_id)
    agent_dir.mkdir(parents=True)
    (agent_dir / "karkard-seed-processed.xlsx").write_bytes(b"xlsx")

    n = reconcile_workspace_manifest(root, agent_id)
    assert n == 1
    assert resolve_workspace_download_path(agent_id, "latest") is not None
