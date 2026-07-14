"""Phase 1 — native function-calling tool binding + selection reliability."""

from __future__ import annotations

from types import SimpleNamespace

from langchain_core.tools import tool

from src.agents_lib.agent_factory import build_system_prompt
from src.agents_lib.cursor_tool_runner import _keyword_hints, select_tools_for_request
from src.agents_lib.graph_agent import resolve_bound_tools
from src.agents_lib.tool_registry import ToolRegistry


def _ensure_registered(slug: str, description: str) -> None:
    if slug in ToolRegistry.list_slugs():
        return

    @tool(slug, description=description)
    def _impl(value: str = "") -> str:  # pragma: no cover - never invoked here
        return value

    ToolRegistry.register(slug, _impl)


def test_resolve_bound_tools_skips_unregistered_without_crashing():
    _ensure_registered("ts_alpha", "Alpha helper tool")
    _ensure_registered("ts_beta", "Beta helper tool")

    tools, missing = resolve_bound_tools(["ts_alpha", "ts_beta", "does_not_exist"])

    assert len(tools) == 2
    assert missing == ["does_not_exist"]


def test_system_prompt_lists_only_declared_tools():
    _ensure_registered("ts_alpha", "Alpha helper tool")
    agent = SimpleNamespace(
        slug="custom-worker",
        system_prompt="Base.",
        kind="worker",
        config_json={},
        tool_names=["ts_alpha"],
        temperature=0.2,
    )
    prompt = build_system_prompt(agent)
    assert "ts_alpha" in prompt
    # A non-declared domain tool must not leak into this agent's prompt.
    assert "run_agent_script" not in prompt


def test_system_prompt_omits_tool_section_for_chat_agent():
    agent = SimpleNamespace(
        slug="plain-chat",
        system_prompt="Base.",
        kind="chat",
        config_json={},
        tool_names=[],
        temperature=0.2,
    )
    prompt = build_system_prompt(agent)
    assert "Available tools" not in prompt


def test_keyword_hints_derive_from_description_for_new_tool():
    _ensure_registered("ts_invoice_export", "Export an invoice spreadsheet for finance")
    hints = _keyword_hints("ts_invoice_export")
    assert "invoice" in hints
    assert "spreadsheet" in hints
    # Generic stopwords must be filtered out.
    assert "for" not in hints


def test_select_tools_uses_derived_keywords():
    _ensure_registered("ts_invoice_export", "Export an invoice spreadsheet for finance")
    chosen = select_tools_for_request("please export the invoice now", ["ts_invoice_export"])
    assert chosen == ["ts_invoice_export"]
