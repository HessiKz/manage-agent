"""Each karkard run must produce a unique file; valid URLs must not be rewritten."""

from __future__ import annotations

import re
from pathlib import Path
from uuid import uuid4

import pytest

from src.agents_lib.custom_tools import karkard_process
from src.core.agent_workspace_files import finalize_agent_output_text, repair_workspace_urls_in_text


def test_karkard_process_twice_creates_two_files(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.chdir(tmp_path)
    agent_id = uuid4()
    agent_dir = tmp_path / "var" / "agent_files" / str(agent_id)
    agent_dir.mkdir(parents=True)
    raw = agent_dir / f"{uuid4().hex}_raw.xlsx"

    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.append(["تاریخ", "کارکرد", "اضافه کار کل", "تاخیر و تعجیل"])
    ws.append(["1405/01/01", "08:00:00", "00:00:00", "00:00:00"])
    wb.save(raw)

    monkeypatch.setattr("src.karkard.output.KARKARD_OUTPUT_DIR", tmp_path / "karkard_out")

    first = karkard_process.invoke(
        {"storage_path": str(raw), "agent_id": str(agent_id), "jalali_year": 1405}
    )
    second = karkard_process.invoke(
        {"storage_path": str(raw), "agent_id": str(agent_id), "jalali_year": 1405}
    )

    assert first["output_file"] != second["output_file"]
    assert (agent_dir / first["output_file"]).is_file()
    assert (agent_dir / second["output_file"]).is_file()


def test_repair_does_not_rewrite_existing_karkard_url(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    agent_id = uuid4()
    root = tmp_path / "var" / "agent_files"
    monkeypatch.setattr("src.core.agent_workspace_files._AGENT_FILES_ROOT", root)

    agent_dir = root / str(agent_id)
    agent_dir.mkdir(parents=True)
    old = agent_dir / "karkard-raw-aaaaaaaa-processed.xlsx"
    new = agent_dir / "karkard-raw-bbbbbbbb-processed.xlsx"
    old.write_bytes(b"old")
    new.write_bytes(b"new")

    url_new = f"/api/v1/agents/{agent_id}/workspace/{new.name}"
    url_old = f"/api/v1/agents/{agent_id}/workspace/{old.name}"

    assert repair_workspace_urls_in_text(f"دانلود: {url_new}", agent_id) == f"دانلود: {url_new}"
    assert repair_workspace_urls_in_text(f"دانلود: {url_old}", agent_id) == f"دانلود: {url_old}"


def test_finalize_preserves_specific_download_path(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    agent_id = uuid4()
    root = tmp_path / "var" / "agent_files"
    monkeypatch.setattr("src.core.agent_workspace_files._AGENT_FILES_ROOT", root)

    agent_dir = root / str(agent_id)
    agent_dir.mkdir(parents=True)
    processed = agent_dir / "karkard-raw-deadbeef-processed.xlsx"
    processed.write_bytes(b"xlsx")

    url = f"/api/v1/agents/{agent_id}/workspace/{processed.name}"
    text = f"✅ گزارش آماده است.\n📥 دانلود: {url}\nخلاصه: پردازش شد."
    out = finalize_agent_output_text(text, agent_id)
    assert url in out
    assert "deadbeef" in out
