"""karkard_process must lock raw input even when LLM passes output-sample path."""

from __future__ import annotations

import re
import shutil
import uuid
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
_FORMDOCS = next(
    (base / "formdocs" for base in (REPO, Path(__file__).resolve().parents[1]) if (base / "formdocs").is_dir()),
    REPO / "formdocs",
)
RAW_INPUT = _FORMDOCS / "ب/کارکرد توسعه کارآفرینی-2.1405.xlsx"
SAMPLE_OUTPUT = _FORMDOCS / "کارکرد_توسعه_کارآفرینی_1405.2.xlsx"


@pytest.mark.skipif(not RAW_INPUT.is_file(), reason="formdocs raw missing")
@pytest.mark.skipif(not SAMPLE_OUTPUT.is_file(), reason="formdocs sample missing")
def test_karkard_process_locks_raw_when_llm_sends_sample_path(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    import src.agents_lib.custom_tools  # noqa: F401
    from src.agents_lib.custom_tools import karkard_process

    monkeypatch.chdir(tmp_path)
    agent_id = uuid.uuid4()
    agent_dir = tmp_path / "var" / "agent_files" / str(agent_id)
    agent_dir.mkdir(parents=True)

    sample_storage = agent_dir / f"{uuid.uuid4().hex}_output-sample__کارکرد_توسعه_کارآفرینی_1405.2.xlsx"
    raw_storage = agent_dir / f"{uuid.uuid4().hex}_کارکرد توسعه کارآفرینی-2.1405.xlsx"
    shutil.copy2(SAMPLE_OUTPUT, sample_storage)
    shutil.copy2(RAW_INPUT, raw_storage)

    # LLM mistakenly passes output-sample storage_path (what users see in production).
    result = karkard_process.invoke(
        {
            "storage_path": str(sample_storage),
            "agent_id": str(agent_id),
            "jalali_year": 1405,
            "company_name": "شرکت توسعه کارآفرینی سوره",
        }
    )

    out_name = result["output_file"]
    assert "کارکرد_توسعه_کارآفرینی_1405.2" not in out_name
    assert re.fullmatch(r"karkard-[0-9a-f]{8}\.xlsx", out_name)
    assert (agent_dir / out_name).is_file() or (raw_storage.parent / out_name).is_file()


@pytest.mark.skipif(not RAW_INPUT.is_file(), reason="formdocs raw missing")
@pytest.mark.skipif(not SAMPLE_OUTPUT.is_file(), reason="formdocs sample missing")
def test_two_runs_produce_distinct_outputs(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    import src.agents_lib.custom_tools  # noqa: F401
    from src.agents_lib.custom_tools import karkard_process

    monkeypatch.chdir(tmp_path)
    agent_id = uuid.uuid4()
    agent_dir = tmp_path / "var" / "agent_files" / str(agent_id)
    agent_dir.mkdir(parents=True)
    sample_storage = agent_dir / f"{uuid.uuid4().hex}_output-sample__کارکرد_توسعه_کارآفرینی_1405.2.xlsx"
    raw_storage = agent_dir / f"{uuid.uuid4().hex}_کارکرد توسعه کارآفرینی-2.1405.xlsx"
    shutil.copy2(SAMPLE_OUTPUT, sample_storage)
    shutil.copy2(RAW_INPUT, raw_storage)

    first = karkard_process.invoke(
        {
            "storage_path": str(sample_storage),
            "agent_id": str(agent_id),
            "jalali_year": 1405,
        }
    )
    second = karkard_process.invoke(
        {
            "storage_path": str(sample_storage),
            "agent_id": str(agent_id),
            "jalali_year": 1405,
        }
    )
    assert first["output_file"] != second["output_file"]
    assert first["download_path"] != second["download_path"]
