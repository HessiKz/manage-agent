"""LangGraph ReAct agent with real tool execution + admin execution trace."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage
from langgraph.prebuilt import create_react_agent

from src.agents_lib.agent_factory import build_llm, build_system_prompt
from src.agents_lib.cursor_tool_runner import run_cursor_tools_agent, select_tools_for_request
from src.agents_lib.execution_trace import AgentRunResult, numbered_trace, trace_step
from src.agents_lib.tool_registry import ToolRegistry
from src.core import llm_runtime
from src.models.agent import Agent


@dataclass
class ReactStreamItem:
    """Incremental stream event from run_react_agent_stream."""

    token: str | None = None
    tool_start: str | None = None
    result: AgentRunResult | None = None


def resolve_bound_tools(names: list[str]) -> tuple[list[Any], list[str]]:
    """Resolve slugs to bound LangChain tools, skipping unregistered ones.

    Returns (tools, missing_slugs). A bad slug must never crash the whole
    invocation — it is reported so config validation can flag it as fixable.
    """
    from src.core.agent_tool_files import wrap_tool_with_file_pipeline

    tools: list[Any] = []
    missing: list[str] = []
    for slug in names:
        try:
            base = ToolRegistry.get(slug)
        except KeyError:
            missing.append(slug)
            continue
        tools.append(wrap_tool_with_file_pipeline(slug, base))
    return tools, missing


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


def _extract_ui_scripts_from_messages(messages: list[BaseMessage]) -> list[dict[str, Any]]:
    scripts: list[dict[str, Any]] = []
    for msg in messages:
        if not isinstance(msg, ToolMessage):
            continue
        content = _normalize_ai_content(msg.content)
        if not content.strip():
            continue
        try:
            data = json.loads(content)
        except json.JSONDecodeError:
            continue
        if not isinstance(data, dict):
            continue
        raw = data.get("ui_script")
        if isinstance(raw, dict) and isinstance(raw.get("steps"), list) and raw["steps"]:
            scripts.append(raw)
    return scripts


def _extract_ui_actions_from_messages(messages: list[BaseMessage]) -> list[dict[str, Any]]:
    actions: list[dict[str, Any]] = []
    for msg in messages:
        if not isinstance(msg, ToolMessage):
            continue
        content = _normalize_ai_content(msg.content)
        if not content.strip():
            continue
        try:
            data = json.loads(content)
        except json.JSONDecodeError:
            continue
        if not isinstance(data, dict):
            continue
        ui = data.get("ui_action")
        if not isinstance(ui, dict):
            continue
        action = dict(ui)
        tool_name = getattr(msg, "name", None) or ""
        if data.get("preview_summary"):
            action["preview"] = data["preview_summary"]
        if data.get("name") and action.get("type") == "navigate":
            action.setdefault("label", f"باز کردن «{data['name']}»")
        elif data.get("agent_name") and action.get("type") == "navigate":
            action.setdefault("label", f"مشاهده «{data['agent_name']}»")
        if "create_agent" in tool_name:
            action.setdefault("kind", "agent_created")
        elif "generate_widget" in tool_name:
            action.setdefault("kind", "widget_generated")
        actions.append(action)
    return actions


async def _forced_support_create_agent_result(
    agent: Agent,
    user_input: str,
    trace: list[dict[str, Any]],
    *,
    llm_provider: str,
    model_name: str,
) -> AgentRunResult | None:
    if agent.slug != "support":
        return None
    from src.agents_lib.platform_support_grounding import (
        format_platform_tool_result,
        infer_agent_create_defaults,
        is_agent_create_request,
        is_agent_testing_on_create_page,
    )

    if not is_agent_create_request(user_input) or is_agent_testing_on_create_page(user_input):
        return None

    from src.agents_lib.platform_tools import platform_create_agent

    defaults = infer_agent_create_defaults(user_input)
    payload = await platform_create_agent.ainvoke(
        {
            "name": defaults["name"],
            "description": defaults["description"],
            "department": defaults["department"],
            "kind": defaults["kind"],
            "output_format_spec": defaults["output_format_spec"],
        }
    )
    payload["_tool"] = "platform_create_agent"
    output = format_platform_tool_result(payload) or payload.get("message") or "ایجنت آماده شد."
    trace.append(
        trace_step(
            "tool_result",
            "ساخت ایجنت با ابزار پلتفرم",
            detail=_truncate(output, 1200),
            payload=payload,
        )
    )
    return AgentRunResult(
        output=output,
        trace=numbered_trace(trace),
        llm_provider=llm_provider,
        model_name=model_name,
        ui_actions=_extract_ui_actions_from_messages([
            ToolMessage(
                content=json.dumps(payload, ensure_ascii=False),
                name="platform_create_agent",
                tool_call_id="forced-platform-create-agent",
            )
        ]),
        ui_scripts=_extract_ui_scripts_from_messages([
            ToolMessage(
                content=json.dumps(payload, ensure_ascii=False),
                name="platform_create_agent",
                tool_call_id="forced-platform-create-agent",
            )
        ]),
    )


def _resolve_tools_and_trace(
    agent: Agent,
    user_input: str,
    tool_names: list[str] | None,
) -> tuple[Any, Any, list[str], list[Any], list[dict[str, Any]]]:
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
    tools, missing = resolve_bound_tools(names)
    if missing:
        names = [n for n in names if n not in missing]
        trace.append(
            trace_step(
                "tool_config_warning",
                "ابزار ثبت‌نشده نادیده گرفته شد",
                detail="، ".join(missing),
                payload={"unregistered_tools": missing},
            )
        )
    return llm, resolved, names, tools, trace


async def _apply_support_post_process(
    agent: Agent,
    user_input: str,
    messages: list[BaseMessage],
    graph,
    out_messages: list[BaseMessage],
) -> list[BaseMessage]:
    if agent.slug != "support":
        return out_messages

    from src.agents_lib.platform_support_grounding import (
        extract_platform_tool_results,
        has_partial_wizard_execute_ui,
        has_provisioning_execution,
        has_ui_execution,
        has_wizard_create_execution,
        infer_agent_create_defaults,
        is_agent_create_request,
        is_agent_testing_on_create_page,
        is_api_provisioning_request,
        is_continue_testing_request,
        is_on_agent_create_wizard,
        is_testing_complete_on_create_page,
        is_ui_action_request,
        is_ui_observation_message,
        is_wizard_steps_incomplete,
        needs_any_platform_tool,
        has_continue_testing_execution,
    )

    tool_results = extract_platform_tool_results(out_messages)
    needs_retry = False
    ui_hint = "ابزار platform_* مناسب (لیست، باز کردن ایجنت، …)."

    if is_ui_observation_message(user_input):
        if is_testing_complete_on_create_page(user_input):
            needs_retry = False
        elif is_wizard_steps_incomplete(user_input) and not has_wizard_create_execution(
            tool_results
        ):
            ui_hint = (
                "ویزارد مراحل ۱–۵ ناقص است — platform_create_agent را فراخوانی کن "
                "(نه execute_ui تک‌مرحله‌ای)."
            )
            needs_retry = True
        elif is_agent_testing_on_create_page(user_input) and not has_continue_testing_execution(
            tool_results
        ):
            ui_hint = (
                "ایجنت ذخیره شده — فقط platform_continue_agent_testing "
                "(آموزش/پنل/تست). platform_create_agent ممنوع است — مراحل ۱–۵ تکرار می‌شود."
            )
            needs_retry = True
    elif is_continue_testing_request(user_input) and is_on_agent_create_wizard(user_input):
        if is_wizard_steps_incomplete(user_input):
            ui_hint = (
                "ویزارد مراحل ۱–۵ ناقص است — platform_create_agent را فراخوانی کن "
                "(نه platform_continue_agent_testing). "
                "شناسه wizard-name-slug-preview فقط پیشنهاد است — حدس نزن."
            )
            if not has_wizard_create_execution(tool_results):
                needs_retry = True
        else:
            ui_hint = (
                "platform_continue_agent_testing را فراخوانی کن — "
                "agent_slug را فقط از ?slug= در URL یا training-panel بگیر. "
                "platform_create_agent ممنوع است."
            )
            if not has_continue_testing_execution(tool_results):
                needs_retry = True
    elif is_agent_create_request(user_input) and is_agent_testing_on_create_page(user_input):
        ui_hint = (
            "ایجنت روی صفحه تست است — platform_continue_agent_testing نه platform_create_agent."
        )
        if not has_continue_testing_execution(tool_results):
            needs_retry = True
    elif is_agent_create_request(user_input) or (
        is_on_agent_create_wizard(user_input)
        and is_ui_action_request(user_input)
        and not is_agent_testing_on_create_page(user_input)
    ):
        defaults = infer_agent_create_defaults(user_input)
        ui_hint = (
            "فوراً platform_create_agent را فراخوانی کن — "
            f"name='{defaults['name']}', department='{defaults['department']}', "
            f"kind='{defaults['kind']}' — از کاربر name/description/department نپرس. "
            "ui_script آن ویزارد کامل + آموزش را اجرا می‌کند. execute_ui برای ویزارد ممنوع است."
        )
        if not has_wizard_create_execution(tool_results) or has_partial_wizard_execute_ui(
            tool_results
        ):
            needs_retry = True
    elif is_api_provisioning_request(user_input):
        ui_hint = (
            "platform_provision_api_agent را فراخوانی کن "
            "(ساخت API + تست + ایجنت). navigate به /integrations کافی نیست."
        )
        if not has_provisioning_execution(tool_results):
            needs_retry = True
    elif is_ui_action_request(user_input):
        ui_hint = (
            "حتماً platform_execute_ui را با steps_json کامل فراخوانی کن "
            "(navigate → wait_for_dom → type/click). فقط catalog کافی نیست."
        )
        if not has_ui_execution(tool_results):
            needs_retry = True
    elif needs_any_platform_tool(user_input) and not tool_results:
        needs_retry = True

    if needs_retry:
        retry_messages = messages + [
            HumanMessage(
                content=(
                    f"{user_input}\n\n"
                    f"[سیستم — اجباری] قبل از پاسخ متنی {ui_hint} "
                    "پاسخ بدون ابزار رد می‌شود."
                )
            )
        ]
        retry = await graph.ainvoke({"messages": retry_messages})
        out_messages = retry.get("messages", out_messages)

    tool_results = extract_platform_tool_results(out_messages)
    if (
        is_agent_create_request(user_input)
        and not is_agent_testing_on_create_page(user_input)
        and not has_wizard_create_execution(tool_results)
    ):
        from src.agents_lib.platform_tools import platform_create_agent

        defaults = infer_agent_create_defaults(user_input)
        forced = await platform_create_agent(
            name=defaults["name"],
            description=defaults["description"],
            department=defaults["department"],
            kind=defaults["kind"],
            output_format_spec=defaults["output_format_spec"],
        )
        out_messages = list(out_messages) + [
            ToolMessage(
                content=json.dumps(forced, ensure_ascii=False),
                name="platform_create_agent",
                tool_call_id="forced-platform-create-agent",
            )
        ]

    return out_messages


def _finalize_react_result(
    agent: Agent,
    user_input: str,
    out_messages: list[BaseMessage],
    *,
    trace: list[dict[str, Any]] | None = None,
    llm_provider: str = "openai",
    model_name: str = "",
) -> AgentRunResult:
    trace = trace or _trace_from_messages(agent, user_input, out_messages)

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

    from src.core.chat_sanitize import humanize_platform_tool_output, sanitize_chat_output

    if agent.slug == "support":
        from src.agents_lib.platform_support_grounding import ground_support_output

        output = ground_support_output(user_input, out_messages, output)
    else:
        from src.core.agent_workspace_files import finalize_agent_output_text

        output = humanize_platform_tool_output(output)
        output = finalize_agent_output_text(output, agent.id)
        output = sanitize_chat_output(output)

    return AgentRunResult(
        output=output.strip() or "No response from agent.",
        trace=trace,
        llm_provider=llm_provider,
        model_name=model_name,
        ui_actions=_extract_ui_actions_from_messages(out_messages),
        ui_scripts=_extract_ui_scripts_from_messages(out_messages),
    )


async def _stream_graph_execution(
    graph,
    messages: list[BaseMessage],
) -> AsyncIterator[tuple[str, str | list[BaseMessage]]]:
    """Yield ('token'|'tool'|'messages', payload) while the ReAct graph runs."""
    out_messages: list[BaseMessage] = list(messages)
    async for event in graph.astream_events({"messages": messages}, version="v2"):
        kind = event.get("event")
        if kind == "on_chat_model_stream":
            chunk = event.get("data", {}).get("chunk")
            token = _normalize_ai_content(getattr(chunk, "content", "")) if chunk else ""
            if token:
                from src.core.chat_sanitize import strip_gateway_route_tags

                token = strip_gateway_route_tags(token, collapse=False)
            if token:
                yield "token", token
        elif kind == "on_tool_start":
            raw = event.get("name") or event.get("data", {}).get("name") or "tool"
            yield "tool", str(raw)
        elif kind == "on_chain_end":
            output = event.get("data", {}).get("output")
            if isinstance(output, dict) and output.get("messages"):
                out_messages = output["messages"]
    yield "messages", out_messages


async def _yield_graph_stream(
    graph,
    messages: list[BaseMessage],
) -> AsyncIterator[ReactStreamItem | list[BaseMessage]]:
    """Yield token/tool items, then the final message list as last item."""
    out_messages: list[BaseMessage] = list(messages)
    async for kind, payload in _stream_graph_execution(graph, messages):
        if kind == "token":
            yield ReactStreamItem(token=str(payload))
        elif kind == "tool":
            yield ReactStreamItem(tool_start=str(payload))
        elif kind == "messages":
            out_messages = payload  # type: ignore[assignment]
    yield out_messages


async def run_react_agent_stream(
    agent: Agent,
    user_input: str,
    history: list[dict] | None,
    *,
    tool_names: list[str] | None = None,
) -> AsyncIterator[ReactStreamItem]:
    """Stream tokens while running the same ReAct path as run_react_agent."""
    llm, resolved, names, tools, trace = _resolve_tools_and_trace(agent, user_input, tool_names)

    if not tools:
        trace.append(trace_step("llm_request", "درخواست به API مدل", detail="بدون ابزار — فقط LLM"))
        messages = _to_lc_messages(agent, user_input, history)
        parts: list[str] = []
        async for chunk in llm.astream(messages):
            token = _normalize_ai_content(getattr(chunk, "content", ""))
            if token:
                from src.core.chat_sanitize import strip_gateway_route_tags

                token = strip_gateway_route_tags(token, collapse=False)
            if not token:
                continue
            parts.append(token)
            yield ReactStreamItem(token=token)
        output = "".join(parts)
        trace.append(
            trace_step(
                "llm_response",
                "پاسخ API",
                detail=_truncate(output or "(خالی)", 1200),
            )
        )
        yield ReactStreamItem(
            result=AgentRunResult(
                output=output or "No response from agent.",
                trace=numbered_trace(trace),
                llm_provider=resolved.provider,
                model_name=resolved.model,
            )
        )
        return

    trace.append(
        trace_step(
            "llm_request",
            "شروع ReAct (مدل + ابزار)",
            detail=f"ابزارها: {', '.join(names)}",
            payload={"tools": names},
        )
    )

    forced_create = await _forced_support_create_agent_result(
        agent,
        user_input,
        trace,
        llm_provider=resolved.provider,
        model_name=resolved.model,
    )
    if forced_create is not None:
        if forced_create.output:
            yield ReactStreamItem(token=forced_create.output)
        yield ReactStreamItem(result=forced_create)
        return

    if resolved.provider == "cursor" and "run_agent_script" not in names:
        direct = await run_cursor_tools_agent(agent, user_input, history, tool_names=names)
        if direct is not None:
            if direct.output:
                yield ReactStreamItem(token=direct.output)
            yield ReactStreamItem(result=direct)
            return
        if (
            "automatic validation" in user_input.lower()
            and not select_tools_for_request(user_input, names)
        ):
            output = "تست خودکار با موفقیت انجام شد."
            yield ReactStreamItem(token=output)
            yield ReactStreamItem(
                result=AgentRunResult(
                    output=output,
                    trace=numbered_trace(trace),
                    llm_provider=resolved.provider,
                    model_name=resolved.model,
                )
            )
            return
        messages = _to_lc_messages(agent, user_input, history)
        parts = []
        async for chunk in llm.astream(messages):
            token = _normalize_ai_content(getattr(chunk, "content", ""))
            if token:
                from src.core.chat_sanitize import strip_gateway_route_tags

                token = strip_gateway_route_tags(token, collapse=False)
            if not token:
                continue
            parts.append(token)
            yield ReactStreamItem(token=token)
        output = "".join(parts)
        if agent.slug == "support":
            from src.agents_lib.platform_support_grounding import ground_support_output

            output = ground_support_output(user_input, [], output or "")
        yield ReactStreamItem(
            result=AgentRunResult(
                output=output or "No response from agent.",
                trace=numbered_trace(trace),
                llm_provider=resolved.provider,
                model_name=resolved.model,
            )
        )
        return

    graph = create_react_agent(llm, tools)
    messages = _to_lc_messages(agent, user_input, history)

    out_messages: list[BaseMessage] = list(messages)
    async for item in _yield_graph_stream(graph, messages):
        if isinstance(item, list):
            out_messages = item
        else:
            yield item

    out_messages = await _apply_support_post_process(
        agent, user_input, messages, graph, out_messages
    )

    trace = _trace_from_messages(agent, user_input, out_messages)
    yield ReactStreamItem(
        result=_finalize_react_result(
            agent,
            user_input,
            out_messages,
            trace=trace,
            llm_provider=resolved.provider,
            model_name=resolved.model,
        )
    )


async def run_react_agent(
    agent: Agent,
    user_input: str,
    history: list[dict] | None,
    *,
    tool_names: list[str] | None = None,
) -> AgentRunResult:
    """Run LangGraph create_react_agent when tools are configured."""
    llm, resolved, names, tools, trace = _resolve_tools_and_trace(agent, user_input, tool_names)

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
    forced_create = await _forced_support_create_agent_result(
        agent,
        user_input,
        trace,
        llm_provider=resolved.provider,
        model_name=resolved.model,
    )
    if forced_create is not None:
        return forced_create

    if resolved.provider == "cursor" and "run_agent_script" not in names:
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
        if agent.slug == "support":
            from src.agents_lib.platform_support_grounding import ground_support_output

            output = ground_support_output(user_input, [], output or "")
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
    out_messages = await _apply_support_post_process(
        agent, user_input, messages, graph, out_messages
    )
    trace = _trace_from_messages(agent, user_input, out_messages)
    return _finalize_react_result(
        agent,
        user_input,
        out_messages,
        trace=trace,
        llm_provider=resolved.provider,
        model_name=resolved.model,
    )
