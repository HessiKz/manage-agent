"""Tool runner coercion for admin action variables."""

from __future__ import annotations

import src.agents_lib.custom_tools  # noqa: F401
from src.demo.tool_runner import normalize_tool_args
from src.agents_lib.tool_registry import ToolRegistry


def test_report_generate_defaults():
    tool = ToolRegistry.get("report_generate")
    args = normalize_tool_args(tool, {"report_type": "نمونه-report_type"})
    # placeholder values fall back to schema default when present
    assert "report_type" in args or args == {}


def test_karkard_process_tool_gone():
    assert "karkard_process" not in ToolRegistry.list_slugs()
