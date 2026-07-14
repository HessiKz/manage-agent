"""Resolve which execution path an invoke should take, by precision tier.

Replaces scattered keyword gates (`_karkard_words`) with an explicit decision
so routing is data-driven and testable. The orchestrator calls this once and
branches on the returned `ExecutionPath`.
"""

from __future__ import annotations

from src.core.precision_defaults import (
    ExecutionPath,
    ExecutionPrecision,
    precision_for_kind,
    precision_from_config,
)
from src.models.agent import Agent, AgentKind
from src.schemas.agent import AgentInvokeRequest


def resolve_precision(agent: Agent) -> ExecutionPrecision:
    return precision_from_config(agent.config_json) or precision_for_kind(agent.kind)


def resolve_execution_path(
    agent: Agent,
    payload: AgentInvokeRequest,
    *,
    caps: dict | None = None,
) -> ExecutionPath:
    """Return one of AUTO_TOOL | REACT | SUPERVISOR | PLAIN_LLM.

    Decision matrix (P = precision, chat = chat_enabled, action = action_slug,
    primary = runtime primary_tool):

    deterministic + action set + run_agent_script:
        -> AUTO_TOOL (pinned workspace script; no hard-coded domain processor)
    guided/autonomous + chat_enabled + tools:
        -> SUPERVISOR if supervisor_enabled else REACT
    else (no tools):
        -> PLAIN_LLM
    """
    precision = resolve_precision(agent)
    caps = caps if caps is not None else (agent.capabilities or {})
    chat_enabled = bool(caps.get("chat_enabled", True))
    action_slug = payload.action_slug

    tool_names = list(agent.tool_names or [])
    runtime = agent.config_json or {}
    primary = str((runtime.get("runtime_plan") or {}).get("primary_tool") or "").strip()

    if precision == ExecutionPrecision.DETERMINISTIC:
        if action_slug:
            if primary == "run_agent_script" or "run_agent_script" in tool_names:
                return ExecutionPath.AUTO_TOOL
        if not action_slug and primary == "run_agent_script":
            return ExecutionPath.AUTO_TOOL

    if bool(caps.get("supervisor_enabled")):
        return ExecutionPath.SUPERVISOR

    # Autonomous worker whose runtime requests the sandbox backend enqueues an
    # async execution_job instead of running inline. P0 path (pinned
    # run_agent_script) stays native — it never reaches here because its
    # precision is deterministic, not autonomous.
    if precision == ExecutionPrecision.AUTONOMOUS and (
        AgentKind.canonical(agent.kind) == AgentKind.WORKER
    ):
        runtime = agent.config_json or {}
        if runtime.get("runtime", {}).get("execution_backend") == "sandbox":
            return ExecutionPath.SANDBOX_JOB

    if chat_enabled or action_slug:
        return ExecutionPath.REACT

    return ExecutionPath.PLAIN_LLM
