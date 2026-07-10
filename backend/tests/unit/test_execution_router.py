"""execution_router + precision_defaults unit tests."""

import pytest
from uuid import uuid4

from src.core.execution_router import resolve_execution_path, resolve_precision
from src.core.precision_defaults import (
    ExecutionPath,
    ExecutionPrecision,
    precision_for_kind,
    precision_from_config,
)
from src.models.agent import AgentKind
from src.schemas.agent import AgentInvokeRequest


def _agent(
    *,
    kind=AgentKind.CHAT,
    caps=None,
    config_json=None,
    tool_names=None,
):
    agent = type(
        "A",
        (),
        {
            "id": uuid4(),
            "kind": kind,
            "capabilities": caps or {},
            "config_json": config_json or {},
            "tool_names": tool_names or [],
        },
    )()
    return agent


def _req(action_slug=None, stream=False):
    return AgentInvokeRequest(input="hi", action_slug=action_slug, stream=stream)


# --- precision defaults ---

def test_precision_defaults_by_kind():
    assert precision_for_kind(AgentKind.WORKER) == ExecutionPrecision.DETERMINISTIC
    assert precision_for_kind(AgentKind.CHAT) == ExecutionPrecision.AUTONOMOUS
    assert precision_for_kind(AgentKind.SUPERVISOR) == ExecutionPrecision.GUIDED
    assert precision_for_kind(AgentKind.CUSTOM) == ExecutionPrecision.GUIDED


def test_precision_from_config_overrides_kind():
    agent = _agent(
        kind=AgentKind.WORKER,
        config_json={"execution_precision": "autonomous"},
    )
    assert resolve_precision(agent) == ExecutionPrecision.AUTONOMOUS


def test_precision_from_config_invalid_falls_back_to_kind():
    agent = _agent(kind=AgentKind.CHAT, config_json={"execution_precision": "bogus"})
    assert resolve_precision(agent) == ExecutionPrecision.AUTONOMOUS  # kind default


def test_precision_from_config_empty_returns_none():
    assert precision_from_config(None) is None
    assert precision_from_config({}) is None


# --- routing matrix (deterministic) ---

def test_deterministic_worker_action_script_route_is_auto_tool():
    agent = _agent(
        kind=AgentKind.WORKER,
        caps={"chat_enabled": False},
        config_json={"runtime_plan": {"primary_tool": "run_agent_script"}},
    )
    assert resolve_execution_path(agent, _req(action_slug="run")) == ExecutionPath.AUTO_TOOL


def test_deterministic_worker_action_karkard_is_react_not_bypass():
    agent = _agent(
        kind=AgentKind.WORKER,
        caps={"chat_enabled": False},
        config_json={"runtime_plan": {"primary_tool": "karkard_process"}},
        tool_names=["karkard_process"],
    )
    assert resolve_execution_path(agent, _req(action_slug="process")) == ExecutionPath.REACT


def test_deterministic_no_action_primary_script_is_auto_tool():
    agent = _agent(
        kind=AgentKind.WORKER,
        caps={"chat_enabled": False},
        config_json={"runtime_plan": {"primary_tool": "run_agent_script"}},
    )
    assert resolve_execution_path(agent, _req()) == ExecutionPath.AUTO_TOOL


# --- routing matrix (supervisor / react / plain) ---

def test_supervisor_enabled_routes_to_supervisor():
    agent = _agent(
        kind=AgentKind.SUPERVISOR,
        caps={"chat_enabled": True, "supervisor_enabled": True},
    )
    assert resolve_execution_path(agent, _req()) == ExecutionPath.SUPERVISOR


def test_guided_chat_with_action_is_react():
    agent = _agent(
        kind=AgentKind.CUSTOM,
        caps={"chat_enabled": True},
        config_json={"execution_precision": "guided"},
        tool_names=["run_agent_script"],
    )
    assert resolve_execution_path(agent, _req(action_slug="run")) == ExecutionPath.REACT


def test_autonomous_chat_is_react():
    agent = _agent(
        kind=AgentKind.CHAT,
        caps={"chat_enabled": True},
        config_json={"execution_precision": "autonomous"},
    )
    assert resolve_execution_path(agent, _req()) == ExecutionPath.REACT


def test_no_tools_no_chat_is_plain_llm():
    agent = _agent(
        kind=AgentKind.WORKER,
        caps={"chat_enabled": False},
        config_json={"execution_precision": "autonomous"},  # override
    )
    # WORKER clamps chat_enabled False; no action + no supervisor -> plain
    assert resolve_execution_path(agent, _req()) == ExecutionPath.PLAIN_LLM


def test_action_slug_without_tools_is_react():
    agent = _agent(
        kind=AgentKind.WORKER,
        caps={"chat_enabled": False},
        config_json={"execution_precision": "guided"},
        tool_names=[],
    )
    # action_slug set routes to React even with no tools (toolless worker action)
    assert resolve_execution_path(agent, _req(action_slug="run")) == ExecutionPath.REACT
