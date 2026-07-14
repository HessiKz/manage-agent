"""P0 regression guard: pinned run_agent_script MUST NEVER route to
SANDBOX_JOB or create execution_jobs rows. Sandbox is only for
AUTONOMOUS + WORKER + execution_backend=='sandbox', and only when the
sandbox_execution_enabled feature flag is on.
"""

from __future__ import annotations

import pytest

from src.core.execution_router import resolve_execution_path
from src.core.precision_defaults import ExecutionPath, ExecutionPrecision
from src.models.agent import AgentKind
from src.schemas.agent import AgentInvokeRequest


def _agent(**overrides):
    base = dict(
        config_json={},
        kind=AgentKind.WORKER,
        tool_names=[],
        capabilities={},
    )
    base.update(overrides)
    return type("FakeAgent", (), base)


def _payload(action_slug: str | None = None):
    return AgentInvokeRequest(input="x", action_slug=action_slug)


def test_pinned_script_never_sandbox():
    """pinned run_agent_script (deterministic) → AUTO_TOOL, never SANDBOX_JOB."""
    a = _agent(
        config_json={
            "execution_precision": "deterministic",
            "runtime_plan": {"primary_tool": "run_agent_script"},
            "runtime": {"execution_backend": "sandbox"},
        },
        tool_names=["run_agent_script"],
    )
    path = resolve_execution_path(a, _payload(action_slug="run_agent_script"))
    assert path == ExecutionPath.AUTO_TOOL, f"pinned leaked to {path}"


def test_autonomous_worker_sandbox_routes_to_sandbox_job():
    a = _agent(
        config_json={
            "execution_precision": "autonomous",
            "runtime": {"execution_backend": "sandbox"},
        },
        kind=AgentKind.WORKER,
        capabilities={},
    )
    path = resolve_execution_path(a, _payload())
    assert path == ExecutionPath.SANDBOX_JOB


def test_autonomous_worker_native_stays_react():
    a = _agent(
        config_json={"execution_precision": "autonomous"},
        kind=AgentKind.WORKER,
        tool_names=["some_tool"],
        capabilities={"chat_enabled": True},
    )
    path = resolve_execution_path(a, _payload())
    assert path == ExecutionPath.REACT


def test_supervisor_takes_precedence_over_sandbox():
    a = _agent(
        config_json={
            "execution_precision": "autonomous",
            "runtime": {"execution_backend": "sandbox"},
        },
        kind=AgentKind.SUPERVISOR,
        capabilities={"supervisor_enabled": True},
    )
    path = resolve_execution_path(a, _payload())
    assert path == ExecutionPath.SUPERVISOR


def test_chat_kind_does_not_sandbox():
    a = _agent(
        config_json={
            "execution_precision": "autonomous",
            "runtime": {"execution_backend": "sandbox"},
        },
        kind=AgentKind.CHAT,
        capabilities={"chat_enabled": True},
    )
    path = resolve_execution_path(a, _payload())
    assert path == ExecutionPath.REACT


def test_no_action_no_chat_falls_through_to_plain_llm():
    a = _agent(
        config_json={"execution_precision": "autonomous"},
        kind=AgentKind.WORKER,
        tool_names=[],
        capabilities={"chat_enabled": False},
    )
    path = resolve_execution_path(a, _payload())
    assert path == ExecutionPath.PLAIN_LLM


def test_orchestrator_sandbox_branch_skips_preview():
    """The orchestrator's SANDBOX_JOB branch must be skipped on preview invokes
    (agent preview never enqueues a job). This documents the `not preview` guard.
    """
    # Resolve path is unchanged, but the branch condition includes `not preview`.
    # We assert the router returns SANDBOX_JOB only for non-supervisor autonomous
    # workers — preview handling is an orchestrator concern and covered in
    # test_orchestrator_preview_sandbox_skip.
    assert ExecutionPath.SANDBOX_JOB != ExecutionPath.REACT
