"""Tool runner coercion for admin action variables."""

from __future__ import annotations

from pathlib import Path

import pytest

import src.agents_lib.custom_tools  # noqa: F401
from src.demo.tool_runner import normalize_tool_args, run_tool_slug
from src.agents_lib.tool_registry import ToolRegistry


@pytest.mark.skipif(
    not (Path(__file__).resolve().parent / "fixtures/karkard_sample.xlsx").is_file(),
    reason="karkard fixture missing",
)
def test_karkard_process_coerces_placeholder_year(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("src.karkard.output.KARKARD_OUTPUT_DIR", tmp_path)
    fixture = Path(__file__).resolve().parent / "fixtures/karkard_sample.xlsx"
    tool = ToolRegistry.get("karkard_process")
    args = normalize_tool_args(
        tool,
        {
            "storage_path": str(fixture),
            "jalali_year": "نمونه-jalali_year",
            "company_name": "نمونه-company_name",
        },
    )
    assert args["jalali_year"] == 1405
    assert args["company_name"] == "شرکت توسعه کارآفرینی سوره"

    result = run_tool_slug(
        "karkard_process",
        {
            "storage_path": str(fixture),
            "jalali_year": "نمونه-jalali_year",
        },
    )
    assert "download_path" in result
    assert "error" not in result
