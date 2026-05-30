"""Mock LLM ReAct for tests — still executes real registered tools."""

from __future__ import annotations

import json
import re

from src.agents_lib.execution_trace import AgentRunResult, numbered_trace, trace_step
from src.demo.tool_runner import format_tool_results, run_tool_slug
from src.models.agent import Agent


def _parse_tool_context(user_input: str) -> dict:
    idx = user_input.find("Context for tools")
    if idx < 0:
        return {}
    brace = user_input.find("{", idx)
    if brace < 0:
        return {}
    depth = 0
    for i, ch in enumerate(user_input[brace:], start=brace):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(user_input[brace : i + 1])
                except json.JSONDecodeError:
                    return {}
    return {}


async def mock_run_react_agent(
    agent: Agent,
    user_input: str,
    history: list[dict] | None,
    *,
    tool_names: list[str] | None = None,
) -> AgentRunResult:
    """Simulate LLM choosing to call tools (production uses create_react_agent + gapgpt)."""
    vars_map = _parse_tool_context(user_input)
    if not vars_map.get("agent_id"):
        m = re.search(r'"agent_id"\s*:\s*"([^"]+)"', user_input)
        if m:
            vars_map["agent_id"] = m.group(1)

    trace = [
        trace_step("llm_request", "mock ReAct", detail="test harness"),
    ]
    results = []
    for slug in tool_names or []:
        try:
            trace.append(trace_step("tool_call", slug, detail="mock invoke"))
            result = run_tool_slug(slug, vars_map)
            results.append(result)
            trace.append(
                trace_step(
                    "tool_result",
                    slug,
                    detail=str(result)[:800],
                )
            )
        except Exception as exc:
            results.append({"error": str(exc), "tool": slug})
    if results:
        output = format_tool_results(results)
        return AgentRunResult(
            output=output,
            trace=numbered_trace(trace),
            llm_provider="mock",
            model_name=agent.model_name,
        )
    output = (
        f"[test mock] LLM would reason here for agent {agent.slug}. "
        "No tools were bound for this run."
    )
    trace.append(trace_step("llm_response", "mock", detail=output))
    return AgentRunResult(
        output=output,
        trace=numbered_trace(trace),
        llm_provider="mock",
        model_name=agent.model_name,
    )
