"""
Build a runnable LLM chat function for a configured Agent row.

LangChain 1.x removed the legacy `AgentExecutor`. For our needs (chat +
optional tool reference inside the system prompt) we just call the
OpenAI-compatible Chat model directly through `langchain_openai.ChatOpenAI`.
Tools are still listed in the system prompt so the model is aware of them.

When we later need real tool-calling we'll port to `langgraph`'s
`create_react_agent` — but this keeps the runtime minimal and reliable.
"""

from __future__ import annotations

from datetime import date

import jdatetime
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from src.agents_lib.tool_registry import ToolRegistry
from src.agents_lib.platform_constants import PLATFORM_SUPPORT_TOOL_NAMES, is_support_agent_slug
from src.core import llm_runtime
from src.demo.datasets import demo_context_for_slug
from src.models.agent import Agent

DEFAULT_SYSTEM_PROMPT = (
    "You are a helpful enterprise AI assistant. "
    "Answer concisely in the user's language (Persian / English). "
    "Use the demo workspace data provided in context."
)

_SUPPORT_PERSIAN_RULE = (
    "\n\nLanguage: Reply ONLY in Persian (Farsi) — chat, thinking, and tool status. "
    "Never write English sentences except proper nouns (API, slug, KPI)."
)

_OUTPUT_STYLE_RULE = (
    "\n\nOutput rules: Reply with plain text only — no :::writing fences, "
    "no XML/markdown wrappers, no meta commentary about how you drafted the answer. "
    "When the user needs a ready-to-send message (e.g. ticket reply), output only that message. "
    "Structure longer answers with Markdown: **bold** labels, `-` bullet lists, "
    "`---` between sections, `###` for short headings, and `1.` numbered steps when useful."
)

_WORKER_EXECUTION_RULE = (
    "\n\nWorker mode rules: You are an execution worker, not a tutor. "
    "For requests/actions, produce concrete final output, decisions, or artifacts directly. "
    "Never answer with generic steps/frameworks/how-to guidance when execution is possible."
)


def _supports_temperature(model_name: str) -> bool:
    """Some gateway models (e.g. Claude Opus 4.7) reject the temperature parameter."""
    name = model_name.lower()
    if "claude-opus-4" in name or "claude-sonnet-4" in name:
        return False
    if name.startswith(("o1", "o3", "o4-mini")):
        return False
    return True


def build_llm(agent: Agent) -> ChatOpenAI:
    """Return a configured ChatOpenAI for the agent's active LLM provider.

    The active provider (env gateway vs. local cursor-to-api proxy) is resolved
    at runtime from the admin toggle — see `src.core.llm_runtime`.
    """
    # Legacy column; ephemeral preview agents may omit it — runtime uses llm_runtime.
    if (agent.model_provider or "openai") != "openai":
        raise NotImplementedError(f"Provider '{agent.model_provider}' not supported yet")
    resolved = llm_runtime.resolve(agent.model_name)
    if not resolved.api_key:
        raise RuntimeError("LLM provider is not configured (missing API key)")
    kwargs: dict = {
        "model": resolved.model,
        "api_key": resolved.api_key,
        "timeout": 600 if resolved.provider == "cursor" else 120,
        "max_retries": 1 if resolved.provider == "cursor" else 2,
    }
    if _supports_temperature(resolved.model):
        kwargs["temperature"] = float(agent.temperature)
    if resolved.base_url:
        kwargs["base_url"] = resolved.base_url
    if resolved.provider == "cursor":
        # cursor-to-api only implements /chat/completions; ChatOpenAI otherwise
        # routes gpt-5* models through the unsupported /responses endpoint.
        kwargs["use_responses_api"] = False
    return ChatOpenAI(**kwargs)


def _instruction_rules_block(agent: Agent) -> str:
    cfg = agent.config_json or {}
    rules = cfg.get("instruction_rules")
    if not isinstance(rules, list) or not rules:
        return ""
    lines = [
        str(item.get("text") or "").strip()
        for item in rules
        if isinstance(item, dict) and str(item.get("text") or "").strip()
    ]
    if not lines:
        return ""
    body = "\n".join(f"- {line}" for line in lines[:30])
    return f"## قوانین الزام‌آور دستورالعمل (کامپایل‌شده)\n{body}"


def _training_profile_block(agent: Agent) -> str:
    cfg = agent.config_json or {}
    tp = cfg.get("training_profile")
    if not tp or not isinstance(tp, dict):
        return ""
    parts: list[str] = []
    if spec := (tp.get("output_format_spec") or "").strip():
        parts.append(f"## فرمت خروجی مورد انتظار (آموزش تعاملی ادمین)\n{spec}")
    if example := (tp.get("example_output") or "").strip():
        parts.append(f"## نمونه پاسخ قابل قبول\n{example}")
    if notes := (tp.get("behavior_notes") or "").strip():
        parts.append(f"## نکات رفتاری\n{notes}")
    return "\n\n".join(parts)


def build_system_prompt(agent: Agent) -> str:
    """Compose the system prompt, listing the agent's available tools."""
    demo = demo_context_for_slug(agent.slug)
    gregorian_today = date.today().isoformat()
    jalali_today = jdatetime.date.today().strftime("%Y/%m/%d")
    runtime_context = (
        "## زمینه زمانی اجرا\n"
        f"تاریخ امروز میلادی: {gregorian_today}\n"
        f"تاریخ امروز شمسی: {jalali_today}\n"
        "برای هر محاسبه، گزارش، نام فایل یا پاسخ وابسته به تاریخ، از همین تاریخ به عنوان زمان فعلی استفاده کن."
    )
    base = agent.system_prompt or DEFAULT_SYSTEM_PROMPT
    base = f"{runtime_context}\n\n{demo}\n\n{base}"
    base = f"{base}{_OUTPUT_STYLE_RULE}"
    if is_support_agent_slug(getattr(agent, "slug", None)):
        base = f"{base}{_SUPPORT_PERSIAN_RULE}"
    kind_value = getattr(getattr(agent, "kind", None), "value", str(getattr(agent, "kind", "")))
    if kind_value == "worker":
        base = f"{base}{_WORKER_EXECUTION_RULE}"
    training = _training_profile_block(agent)
    if training:
        base = f"{base}\n\n{training}"
    rules_block = _instruction_rules_block(agent)
    if rules_block:
        base = f"{base}\n\n{rules_block}"
    if is_support_agent_slug(getattr(agent, "slug", None)):
        tool_slugs = list(PLATFORM_SUPPORT_TOOL_NAMES)
    else:
        # Only advertise the tools this agent actually has bound at runtime, so
        # the model is steered to its real toolset rather than every domain tool.
        tool_slugs = [str(t) for t in (getattr(agent, "tool_names", None) or [])]
        cfg = getattr(agent, "config_json", None) or {}
        primary = str((cfg.get("runtime_plan") or {}).get("primary_tool") or "").strip()
        if primary and primary not in tool_slugs:
            tool_slugs.append(primary)
    if not tool_slugs:
        return base
    tool_lines = []
    for slug in tool_slugs:
        try:
            t = ToolRegistry.get(slug)
            tool_lines.append(f"- {slug}: {t.description}")
        except KeyError:
            tool_lines.append(f"- {slug}: (not registered)")
    return (
        f"{base}\n\nAvailable tools (call the one that matches the request — never guess):\n"
        + "\n".join(tool_lines)
        + "\nبرای پردازش فایل یا هر عملیات قطعی، ابزارِ متناظر را فراخوانی کن؛ اگر هیچ ابزاری مناسب نیست، پاسخ متنی بده."
    )


def build_messages(
    agent: Agent,
    user_input: str,
    history: list[dict] | None = None,
) -> list[BaseMessage]:
    """Build the chat-message list to send to the model."""
    messages: list[BaseMessage] = [SystemMessage(content=build_system_prompt(agent))]
    for msg in history or []:
        role = msg.get("role")
        content = msg.get("content", "")
        if role == "user":
            messages.append(HumanMessage(content=content))
        elif role == "assistant":
            messages.append(AIMessage(content=content))
    messages.append(HumanMessage(content=user_input))
    return messages
