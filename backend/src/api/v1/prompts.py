"""Prompt templates + AI-assisted prompt generation for the agent wizard."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from langchain_openai import ChatOpenAI

from src.agents_lib.agent_factory import _supports_temperature
from src.api.dependencies import CurrentSuperuser
from src.core import llm_runtime
from src.schemas.prompt import (
    PromptImproveRequest,
    PromptImproveResponse,
    PromptSuggestRequest,
    PromptSuggestResponse,
    PromptTemplateRead,
)

router = APIRouter()

PROMPT_TEMPLATES: list[PromptTemplateRead] = [
    PromptTemplateRead(
        name="محاسبه حقوق",
        description="پردازش حقوق ماهانه، اضافه‌کار، فیش و خروجی پرداخت.",
        system_prompt=(
            "تو دستیار مالی سازمان هستی برای محاسبه حقوق. پاسخ‌ها را فارسی، حرفه‌ای و مختصر بده. "
            "در مواجهه با موارد پرریسک (مثل ثبت سند در ERP) درخواست تأیید دومرحله‌ای کن."
        ),
    ),
    PromptTemplateRead(
        name="پاسخ به تیکت",
        description="پاسخ‌گویی به تیکت‌ها با اولویت‌بندی و لحن رسمی.",
        system_prompt="تو مسئول پشتیبانی هستی. پاسخ‌ها رسمی، کوتاه و با مراحل اقدام روشن باشد.",
    ),
]

_DEPT_FA = {
    "finance": "مالی",
    "hr": "منابع انسانی",
    "support": "پشتیبانی",
    "sales": "فروش",
    "ops": "عملیات",
}

_KIND_FA = {
    "chat": "گفت‌وگو",
    "worker": "کارگر (اجرایی)",
    "supervisor": "سرپرست",
    "custom": "سفارشی",
}


def _build_llm() -> ChatOpenAI:
    resolved = llm_runtime.resolve()
    if not resolved.api_key:
        raise HTTPException(status_code=503, detail="سرویس هوش مصنوعی پیکربندی نشده است.")
    kwargs: dict = {
        "model": resolved.model,
        "api_key": resolved.api_key,
        "timeout": 600 if resolved.provider == "cursor" else 120,
        "max_retries": 1,
    }
    if _supports_temperature(resolved.model):
        kwargs["temperature"] = 0.3
    if resolved.base_url:
        kwargs["base_url"] = resolved.base_url
    if resolved.provider == "cursor":
        kwargs["use_responses_api"] = False
    return ChatOpenAI(**kwargs)


def _format_capabilities(caps: dict[str, bool] | None) -> str:
    if not caps:
        return "—"
    labels = {
        "chat_enabled": "گفت‌وگو",
        "file_upload_enabled": "دریافت فایل",
        "actions_enabled": "اقدامات",
        "templates_enabled": "قالب‌ها",
        "can_call_agents": "فراخوانی ایجنت",
        "supervisor_enabled": "سرپرستی",
        "external_apis_enabled": "API خارجی",
    }
    active = [labels[k] for k, v in caps.items() if v and k in labels]
    return "، ".join(active) if active else "—"


@router.get("/prompt-templates", response_model=list[PromptTemplateRead])
async def list_templates(_admin: CurrentSuperuser):
    return PROMPT_TEMPLATES


@router.post("/prompts/suggest", response_model=PromptSuggestResponse)
async def suggest_prompt(payload: PromptSuggestRequest, _admin: CurrentSuperuser):
    """Generate a system prompt from agent wizard context using the configured LLM."""
    llm = _build_llm()

    dept = _DEPT_FA.get(payload.department or "", payload.department or "—")
    kind = _KIND_FA.get(payload.kind, payload.kind)
    tools = ", ".join(payload.tool_names) if payload.tool_names else "هیچ"
    caps = _format_capabilities(payload.capabilities)

    sys = (
        "You are an expert prompt engineer for Persian enterprise AI agents. "
        "Write ONE system prompt in Persian (fa-IR) for the agent described below. "
        "Rules:\n"
        "- Output ONLY the system prompt text — no quotes, no markdown, no explanation.\n"
        "- Match the agent kind: worker agents must execute (call tools, produce artifacts); "
        "chat agents are conversational but still actionable.\n"
        "- If tools are listed, instruct the agent to actually invoke them when relevant.\n"
        "- If file upload is enabled, tell the agent to use uploaded files, not ask the user to re-upload.\n"
        "- If instruction file content is provided, treat it as authoritative business rules and include concrete details.\n"
        "- Keep it 120–220 words, professional, specific to the use case.\n"
        "- Preserve any useful intent from existing_prompt if provided.\n"
        "- Do NOT add generic filler like 'پاسخ‌ها کوتاه و رسمی باشند' unless it fits the role."
    )

    user_parts = [
        f"نام ایجنت: {payload.name}",
        f"بخش: {dept}",
        f"نوع: {kind}",
        f"توانایی‌ها: {caps}",
        f"ابزارها: {tools}",
    ]
    if payload.description:
        user_parts.append(f"توضیح: {payload.description.strip()}")
    if payload.existing_prompt and payload.existing_prompt.strip():
        user_parts.append(f"متن فعلی (بهبود یا جایگزینی هوشمند):\n{payload.existing_prompt.strip()}")
    if payload.instruction_files:
        user_parts.append(
            "متن استخراج‌شده از فایل‌های دستورالعمل:\n"
            + "\n\n".join(payload.instruction_files)[:48000]
        )

    result = await llm.ainvoke(
        [{"role": "system", "content": sys}, {"role": "user", "content": "\n".join(user_parts)}]
    )
    text = (getattr(result, "content", None) or str(result)).strip()
    if not text:
        raise HTTPException(status_code=502, detail="مدل پاسخی برنگرداند.")
    return PromptSuggestResponse(suggested_prompt=text)


@router.post("/prompts/improve", response_model=PromptImproveResponse)
async def improve_prompt(payload: PromptImproveRequest, _admin: CurrentSuperuser):
    """Improve an existing system prompt using the configured LLM."""
    llm = _build_llm()
    sys = (
        "You are an expert prompt engineer for enterprise AI agents. "
        "Rewrite the SYSTEM PROMPT to be professional, safe, and action-oriented. "
        "Keep it concise. Preserve variable placeholders like {{period}}. "
        "Output ONLY the improved prompt — no markdown or commentary."
    )
    user = f"LANG={payload.locale}\nTEMPLATE={payload.template or '-'}\n\nSYSTEM PROMPT:\n{payload.prompt}"
    result = await llm.ainvoke([{"role": "system", "content": sys}, {"role": "user", "content": user}])
    improved_text = getattr(result, "content", None) or str(result)
    return PromptImproveResponse(improved_prompt=improved_text.strip())
