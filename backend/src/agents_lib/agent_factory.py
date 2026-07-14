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

import re
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


def _instruction_files_verbatim_block(agent: Agent) -> str:
    cfg = agent.config_json or {}
    blocks = cfg.get("instruction_files_text")
    if not isinstance(blocks, list) or not blocks:
        # Lazy path when compile didn't persist blocks yet (older agents).
        blocks = _load_instruction_file_blocks_from_disk(agent)
    if not isinstance(blocks, list) or not blocks:
        return ""
    parts: list[str] = [
        "## محتوای فایل‌های دستورالعمل (بصورت کامل و کلمه‌به‌کلمه)",
        "این متن دقیقاً همان محتوای فایل دستورالعمل است و سطح‌بالاترین منبع حقیقت برای توست.",
        "هیچ‌گاه تحت هیچ شرایطی با بخشی از این متن تعارض ایجاد نکن و در اجرا هرگز آن را نادیده نگیر.",
        "هر بخشی از این متن را کلمه‌به‌کلمه به‌عنوان قانون در نظر بگیر و در هنگام پاسخ/اقدام/خروجی همیشه آن را لحاظ کن.",
    ]
    for b in blocks:
        if not isinstance(b, dict):
            continue
        fname = str(b.get("filename") or "").strip()
        text = str(b.get("text") or "").rstrip()
        if not text:
            continue
        parts.append(f"### فایل دستورالعمل: {fname}\n```\n{text}\n```")
    return "\n\n".join(parts)


def _load_instruction_file_blocks_from_disk(agent: Agent) -> list[dict[str, str]]:
    """Best-effort read of instruction files when config_json lacks cached text."""
    try:
        from pathlib import Path

        from src.core.agent_file_roles import display_agent_filename, is_instruction_file
        from src.core.file_text_extract import extract_text
    except Exception:
        return []
    root = Path("var/agent_files") / str(agent.id)
    if not root.is_dir():
        return []
    blocks: list[dict[str, str]] = []
    used = 0
    max_file, max_total = 24_000, 48_000
    for path in sorted(root.iterdir()):
        if not path.is_file():
            continue
        name = path.name
        if not is_instruction_file(name):
            continue
        try:
            raw = path.read_bytes()
            text = extract_text(raw, None, name)
        except Exception:
            continue
        if not text or len(text.strip()) < 10:
            continue
        remaining = max(0, max_total - used)
        if remaining <= 0:
            break
        clipped = text.strip()
        if len(clipped) > min(max_file, remaining):
            clipped = clipped[: min(max_file, remaining)].rstrip() + "\n[... متن کوتاه شد ...]"
        used += len(clipped)
        blocks.append({"filename": display_agent_filename(name), "text": clipped})
    return blocks


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
    # ponytail: instruction-file verbatim anchor — the #1 priority context.
    # Inline EVERY line of the instruction file text into EVERY call so
    # the agent literally cannot forget it. Placed BEFORE the rule summary
    # so the verbatim source dominates the rule extraction summary.
    files_block = _instruction_files_verbatim_block(agent)
    if files_block:
        base = f"{base}\n\n{files_block}"
    rules_block = _instruction_rules_block(agent)
    if rules_block:
        base = f"{base}\n\n{rules_block}"
    # time.ir holiday calendar for karkard / attendance-style agents
    try:
        from src.services.holiday_service import (
            agent_wants_holiday_context,
            holiday_calendar_prompt_block,
        )

        if agent_wants_holiday_context(agent):
            cal = holiday_calendar_prompt_block(agent)
            if cal:
                base = f"{base}\n\n{cal}"
    except Exception:  # noqa: BLE001
        pass
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


def _instruction_files_rag_supplement(agent: Agent, user_input: str, *, cap_lines: int = 12) -> str:
    """RAG hook: pull the most relevant instruction-file lines for THIS query.

    The verbatim file text is already in the system prompt (every call). For
    long files the model can still miss a buried rule, so we additionally
    surface the lines whose terms best match the user's question. This is a
    lightweight keyword-overlap retriever — no embeddings needed — and only
    fires when the query carries concrete terms (otherwise it stays silent so
    it never adds noise to casual chat).
    """
    if not user_input or not user_input.strip():
        return ""
    cfg = agent.config_json or {}
    blocks = cfg.get("instruction_files_text")
    if not isinstance(blocks, list) or not blocks:
        return ""
    stop = set("و برای به از با در که این آن را یا یک متن سوال فایل ایجنت ".split())
    qterms = {t for t in re.split(r"\W+", user_input) if len(t) >= 3 and t not in stop}
    if not qterms:
        return ""
    scored: list[tuple[int, str]] = []
    for b in blocks:
        if not isinstance(b, dict):
            continue
        text = str(b.get("text") or "")
        for line in text.splitlines():
            line = line.strip()
            if len(line) < 6:
                continue
            lterms = {t for t in re.split(r"\W+", line) if len(t) >= 3}
            hits = len(qterms & lterms)
            if hits:
                scored.append((hits, line))
    if not scored:
        return ""
    scored.sort(key=lambda x: -x[0])
    picked = scored[:cap_lines]
    body = "\n".join(f"- {ln}" for _, ln in picked)
    return (
        "## بخش‌های مرتبط از فایل دستورالعمل (بازیابی‌شده برای این درخواست)\n"
        "این خطوط دقیقاً از فایل دستورالعمل برداشته شده‌اند — در پاسخ به این درخواست "
        "حتماً طبق آن‌ها عمل کن:\n" + body
    )


def build_messages(
    agent: Agent,
    user_input: str,
    history: list[dict] | None = None,
) -> list[BaseMessage]:
    """Build the chat-message list to send to the model."""
    messages: list[BaseMessage] = [SystemMessage(content=build_system_prompt(agent))]
    # ponytail: RAG-style supplementation. The verbatim files already sit
    # inside the system prompt (see _instruction_files_verbatim_block). As a
    # belt-and-suspenders, also retrieve the chunks whose lines look most
    # relevant to the user's question and surface them on the user side
    # too — so long files don't drop important rules past the model's
    # attention horizon.
    rag = _instruction_files_rag_supplement(agent, user_input)
    if rag:
        messages.append(SystemMessage(content=rag))
    for msg in history or []:
        role = msg.get("role")
        content = msg.get("content", "")
        if role == "user":
            messages.append(HumanMessage(content=content))
        elif role == "assistant":
            messages.append(AIMessage(content=content))
    messages.append(HumanMessage(content=user_input))
    return messages
