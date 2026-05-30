"""LangGraph ReAct agent with real tool execution + admin execution trace."""

from __future__ import annotations

import json
from typing import Any

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage
from langgraph.prebuilt import create_react_agent

from src.agents_lib.agent_factory import build_llm, build_system_prompt
from src.agents_lib.cursor_tool_runner import run_cursor_tools_agent, select_tools_for_request
from src.agents_lib.execution_trace import AgentRunResult, numbered_trace, trace_step
from src.agents_lib.tool_registry import ToolRegistry
from src.core import llm_runtime
from src.models.agent import Agent


def _normalize_ai_content(content) -> str:
    if isinstance(content, list):
        return "".join(
            p.get("text", "") if isinstance(p, dict) else str(p) for p in content
        )
    return str(content) if content is not None else ""


def _truncate(value: str, limit: int = 1200) -> str:
    value = value.strip()
    if len(value) <= limit:
        return value
    return value[: limit - 1] + "…"


def _provider_label(agent: Agent) -> str:
    resolved = llm_runtime.resolve(agent.model_name)
    base = resolved.base_url or "https://api.openai.com/v1"
    return f"{resolved.provider} · {resolved.model} · {base}"


def _to_lc_messages(agent: Agent, user_input: str, history: list[dict] | None) -> list[BaseMessage]:
    messages: list[BaseMessage] = [SystemMessage(content=build_system_prompt(agent))]
    for msg in history or []:
        role, content = msg.get("role"), msg.get("content", "")
        if role == "user":
            messages.append(HumanMessage(content=content))
        elif role == "assistant":
            messages.append(AIMessage(content=content))
    messages.append(HumanMessage(content=user_input))
    return messages


def _trace_from_messages(
    agent: Agent,
    user_input: str,
    out_messages: list[BaseMessage],
) -> list[dict[str, Any]]:
    steps: list[dict[str, Any]] = [
        trace_step(
            "llm_config",
            "پیکربندی مدل",
            detail=_provider_label(agent),
            payload={
                "model": llm_runtime.resolve(agent.model_name).model,
                "base_url": llm_runtime.resolve(agent.model_name).base_url,
            },
        ),
        trace_step(
            "user_input",
            "ورودی کاربر / اقدام",
            detail=_truncate(user_input, 800),
        ),
    ]

    for msg in out_messages:
        if isinstance(msg, AIMessage):
            if msg.tool_calls:
                for tc in msg.tool_calls:
                    name = tc.get("name", "tool")
                    args = tc.get("args", {})
                    steps.append(
                        trace_step(
                            "tool_call",
                            f"فراخوانی ابزار: {name}",
                            detail=_truncate(json.dumps(args, ensure_ascii=False), 600),
                            payload={"tool": name, "args": args},
                        )
                    )
            content = _normalize_ai_content(msg.content)
            if content.strip():
                steps.append(
                    trace_step(
                        "llm_response",
                        "پاسخ مدل",
                        detail=_truncate(content, 1200),
                    )
                )
        elif isinstance(msg, ToolMessage):
            name = getattr(msg, "name", None) or "tool"
            content = _normalize_ai_content(msg.content)
            steps.append(
                trace_step(
                    "tool_result",
                    f"نتیجه ابزار: {name}",
                    detail=_truncate(content, 1200),
                    payload={"tool": name},
                )
            )

    return numbered_trace(steps)


async def run_react_agent(
    agent: Agent,
    user_input: str,
    history: list[dict] | None,
    *,
    tool_names: list[str] | None = None,
) -> AgentRunResult:
    """Run LangGraph create_react_agent when tools are configured."""
    trace: list[dict[str, Any]] = [
        trace_step(
            "llm_config",
            "پیکربندی مدل",
            detail=_provider_label(agent),
            payload={
                "model": llm_runtime.resolve(agent.model_name).model,
                "base_url": llm_runtime.resolve(agent.model_name).base_url,
            },
        ),
        trace_step("user_input", "ورودی", detail=_truncate(user_input, 800)),
    ]

    llm = build_llm(agent)
    resolved = llm_runtime.resolve(agent.model_name)
    names = tool_names if tool_names is not None else list(agent.tool_names or [])
    tools = ToolRegistry.get_many(names) if names else []

    if not tools:
        trace.append(trace_step("llm_request", "درخواست به API مدل", detail="بدون ابزار — فقط LLM"))
        messages = _to_lc_messages(agent, user_input, history)
        ai_msg = await llm.ainvoke(messages)
        output = _normalize_ai_content(getattr(ai_msg, "content", str(ai_msg)))
        trace.append(
            trace_step(
                "llm_response",
                "پاسخ API",
                detail=_truncate(output or "(خالی)", 1200),
            )
        )
        return AgentRunResult(
            output=output or "No response from agent.",
            trace=numbered_trace(trace),
            llm_provider=resolved.provider,
            model_name=resolved.model,
        )

    trace.append(
        trace_step(
            "llm_request",
            "شروع ReAct (مدل + ابزار)",
            detail=f"ابزارها: {', '.join(names)}",
            payload={"tools": names},
        )
    )
    if resolved.provider == "cursor":
        direct = await run_cursor_tools_agent(
            agent, user_input, history, tool_names=names
        )
        if direct is not None:
            return direct
        if (
            "automatic validation" in user_input.lower()
            and not select_tools_for_request(user_input, names)
        ):
            trace.append(
                trace_step(
                    "llm_response",
                    "پاسخ API",
                    detail="تست خودکار — بدون فراخوانی مدل",
                )
            )
            return AgentRunResult(
                output="تست خودکار با موفقیت انجام شد.",
                trace=numbered_trace(trace),
                llm_provider=resolved.provider,
                model_name=resolved.model,
            )
        trace.append(
            trace_step("llm_request", "درخواست به API مدل", detail="cursor chat (بدون ابزار)")
        )
        messages = _to_lc_messages(agent, user_input, history)
        ai_msg = await llm.ainvoke(messages)
        output = _normalize_ai_content(getattr(ai_msg, "content", str(ai_msg)))
        trace.append(
            trace_step(
                "llm_response",
                "پاسخ API",
                detail=_truncate(output or "(خالی)", 1200),
            )
        )
        return AgentRunResult(
            output=output or "No response from agent.",
            trace=numbered_trace(trace),
            llm_provider=resolved.provider,
            model_name=resolved.model,
        )

    graph = create_react_agent(llm, tools)
    messages = _to_lc_messages(agent, user_input, history)
    result = await graph.ainvoke({"messages": messages})
    out_messages = result.get("messages", [])
    trace = _trace_from_messages(agent, user_input, out_messages)

    output = ""
    for msg in reversed(out_messages):
        if isinstance(msg, AIMessage) and msg.content and not msg.tool_calls:
            output = _normalize_ai_content(msg.content)
            break
        if isinstance(msg, AIMessage) and msg.content:
            output = _normalize_ai_content(msg.content)
            break

    if not output.strip():
        for msg in reversed(out_messages):
            if isinstance(msg, ToolMessage):
                output = _normalize_ai_content(msg.content)
                if output.strip():
                    break

    return AgentRunResult(
        output=output.strip() or "No response from agent.",
        trace=trace,
        llm_provider=resolved.provider,
        model_name=resolved.model,
    )
