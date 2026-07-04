"""Dynamic execution-tab copy: rule-based baseline + optional LLM enhancement."""

from __future__ import annotations

import hashlib
import json
import re
from typing import Any

from langchain_openai import ChatOpenAI
from sqlalchemy.ext.asyncio import AsyncSession

from src.agents_lib.agent_factory import _supports_temperature
from src.core import llm_runtime
from src.demo.agent_execution_profiles import AGENT_EXECUTION_BY_SLUG
from src.models.agent import Agent, AgentKind
from src.models.agent_action import AgentAction
from src.models.agent_prompt_template import AgentPromptTemplate
from src.schemas.agent_execution import AgentExecutionTestStep

_DEPT_FA = {
    "finance": "مالی",
    "hr": "منابع انسانی",
    "support": "پشتیبانی",
    "sales": "فروش",
    "ops": "عملیات",
}

_KIND_FA = {
    "chat": "گفت‌وگو",
    "worker": "کارگر عملیاتی",
    "supervisor": "سرپرست",
    "file_intake": "دریافت فایل",
    "custom": "سفارشی",
}


def _kind_value(kind: AgentKind | str) -> str:
    if hasattr(kind, "value"):
        return str(kind.value)
    return str(kind)


def execution_guide_status(agent: Agent) -> dict[str, str | None]:
    """Return {state, source} for polling after admin edits."""
    cfg = dict(agent.config_json or {})
    meta = dict(cfg.get("execution_guide_status") or {})
    state = str(meta.get("state") or "idle")
    cache = dict(cfg.get("execution_guide") or {})
    source = meta.get("source") or cache.get("source")
    if state == "idle" and cache.get("guide"):
        state = "ready"
    return {"state": state, "source": str(source) if source else None}


def mark_execution_guide_generating(cfg: dict[str, Any]) -> dict[str, Any]:
    out = dict(cfg)
    out.pop("execution_guide", None)
    out["execution_guide_status"] = {"state": "generating"}
    return out


def mark_execution_guide_ready(cfg: dict[str, Any], source: str) -> dict[str, Any]:
    out = dict(cfg)
    out["execution_guide_status"] = {"state": "ready", "source": source}
    return out


def mark_execution_guide_failed(cfg: dict[str, Any]) -> dict[str, Any]:
    out = dict(cfg)
    out["execution_guide_status"] = {"state": "failed", "source": "rule"}
    return out


def guide_fingerprint(
    agent: Agent,
    actions: list[AgentAction],
    templates: list[AgentPromptTemplate],
) -> str:
    payload = {
        "name": agent.name,
        "description": agent.description or "",
        "department": agent.department or "",
        "kind": _kind_value(agent.kind),
        "capabilities": agent.capabilities or {},
        "file_policy": agent.file_policy or {},
        "tool_names": list(agent.tool_names or []),
        "system_prompt": (agent.system_prompt or "")[:500],
        "training_profile": (agent.config_json or {}).get("training_profile"),
        "instruction_prompt": (agent.config_json or {}).get("instruction_prompt"),
        "instruction_rules": (agent.config_json or {}).get("instruction_rules"),
        "actions": [
            {"slug": a.slug, "label": a.label, "description": a.description or ""}
            for a in actions
        ],
        "templates": [{"slug": t.slug, "label": t.label} for t in templates],
    }
    raw = json.dumps(payload, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def _split_description(text: str) -> list[str]:
    if not text.strip():
        return []
    parts = re.split(r"[\n؛;]+", text.strip())
    out = [p.strip() for p in parts if p.strip()]
    if len(out) == 1 and len(out[0]) > 120:
        parts = re.split(r"[.!?؟]\s+", out[0])
        out = [p.strip() for p in parts if len(p.strip()) > 8]
    return out[:6]


def _input_labels_from_action(action: AgentAction) -> list[str]:
    schema = action.input_schema if isinstance(action.input_schema, dict) else {}
    props = schema.get("properties")
    if isinstance(props, dict):
        return [str(meta.get("title") or key) for key, meta in props.items() if isinstance(meta, dict)]
    skip = frozenset({"properties", "required", "type", "$schema"})
    return [
        str(v.get("title") or k)
        for k, v in schema.items()
        if k not in skip and isinstance(v, dict)
    ]


def build_rule_based_guide(
    agent: Agent,
    actions: list[AgentAction],
    templates: list[AgentPromptTemplate],
) -> dict[str, Any]:
    kind = _kind_value(agent.kind)
    dept = _DEPT_FA.get(agent.department or "", agent.department or "عملیات")
    caps = agent.capabilities or {}
    policy = agent.file_policy or {}

    slug_seed = AGENT_EXECUTION_BY_SLUG.get(agent.slug) if agent.slug in AGENT_EXECUTION_BY_SLUG else None
    training = (agent.config_json or {}).get("training_profile")
    training = training if isinstance(training, dict) else None

    domain_label = slug_seed.get("domain_label") if slug_seed else f"{dept} · {_KIND_FA.get(kind, kind)}"
    headline = agent.name
    summary = (agent.description or "").strip()
    if not summary and slug_seed:
        summary = slug_seed.get("summary", "")
    if not summary:
        summary = f"ایجنت «{agent.name}» برای خودکارسازی کارهای {dept}."

    responsibilities: list[str] = []
    for line in _split_description(agent.description or ""):
        responsibilities.append(line)
    if not responsibilities and slug_seed:
        responsibilities = list(slug_seed.get("responsibilities") or [])
    for act in actions:
        if act.description:
            responsibilities.append(f"{act.label}: {act.description}")
        else:
            responsibilities.append(f"اجرای اقدام «{act.label}»")
    for tpl in templates[:3]:
        responsibilities.append(f"استفاده از قالب «{tpl.label}»")
    if caps.get("supervisor_enabled"):
        responsibilities.append("مسیریابی درخواست به زیرایجنت‌های متصل")
    if not responsibilities:
        responsibilities = [f"پشتیبانی از فرایندهای {dept} با قابلیت‌های فعال این ایجنت"]
    if training and training.get("responsibilities"):
        responsibilities = list(training["responsibilities"])[:8]

    how_to: list[str] = []
    if caps.get("file_upload_enabled"):
        exts = ", ".join(policy.get("allowed_extensions") or [".pdf"])[:80]
        how_to.append(f"در بخش «دریافت فایل»، فایل مجاز ({exts}) را آپلود کنید.")
    if caps.get("actions_enabled") and actions:
        how_to.append("از منوی کشویی «اقدام»، مورد دلخواه را انتخاب کنید.")
        how_to.append("فیلدهای ورودی را تکمیل کنید.")
        how_to.append("دکمه «اجرا» در پایین صفحه را بزنید.")
    elif caps.get("file_upload_enabled") and not caps.get("chat_enabled"):
        how_to.append("دکمه «اجرا» در پایین بخش دریافت فایل را بزنید.")
        how_to.append("نتیجه در بخش «خروجی اجرا» پایین صفحه نمایش داده می‌شود.")
    elif caps.get("chat_enabled"):
        how_to.append("به تب «گفت‌وگو» بروید و درخواست خود را بنویسید.")
        how_to.append("Enter یا دکمه ارسال را بزنید.")
    if caps.get("templates_enabled") and templates:
        how_to.append(f"می‌توانید از قالب «{templates[0].label}» برای شروع سریع استفاده کنید.")
    if caps.get("supervisor_enabled"):
        how_to.append("درخواست را به زبان طبیعی بنویسید؛ سرپرست زیرایجنت مناسب را انتخاب می‌کند.")
    if caps.get("external_apis_enabled"):
        how_to.append("می‌توانید از ایجنت بخواهید endpointهای API متصل را فراخوانی کند.")
    if caps.get("can_call_agents"):
        how_to.append("ایجنت می‌تواند ایجنت‌های متصل را به‌عنوان ابزار فراخوانی کند.")
    if policy.get("require_files_to_invoke"):
        how_to.append(f"حداقل {policy.get('min_files', 1)} فایل قبل از اجرا الزامی است.")
    if not how_to and slug_seed:
        how_to = list(slug_seed.get("how_to_steps") or [])
    if not how_to:
        how_to = ["صفحه را مرور کنید و از بخش «اجرای ایجنت» در پایین استفاده کنید."]
    if training and training.get("how_to_steps"):
        how_to = list(training["how_to_steps"])[:6]

    inputs: list[str] = []
    for act in actions:
        for label in _input_labels_from_action(act):
            if label not in inputs:
                inputs.append(label)
    if caps.get("file_upload_enabled"):
        mimes = policy.get("allowed_mime_types") or []
        if mimes:
            inputs.append(f"فایل ({', '.join(str(m) for m in mimes[:3])})")
        else:
            inputs.append("فایل پیوست")
    if caps.get("chat_enabled") and not inputs:
        inputs.append("متن درخواست / سؤال")
    if slug_seed and not inputs:
        inputs = list(slug_seed.get("inputs") or [])

    outputs: list[str] = []
    for act in actions:
        if act.description and "گزارش" in act.description:
            outputs.append(f"خروجی «{act.label}»")
        elif getattr(act, "tool_chain", None):
            outputs.append(f"نتیجه اجرای «{act.label}»")
    if caps.get("chat_enabled"):
        outputs.append("پاسخ متنی")
    if caps.get("file_upload_enabled"):
        outputs.append("تأیید دریافت / ingest فایل")
    if slug_seed and len(outputs) < 2:
        for item in slug_seed.get("outputs") or []:
            if item not in outputs:
                outputs.append(item)
    if not outputs:
        outputs = ["نتیجه اجرا در تب گفت‌وگو"]

    tips: list[str] = []
    if kind == "worker" and not caps.get("chat_enabled"):
        if caps.get("file_upload_enabled") and not caps.get("actions_enabled"):
            tips.append("پس از آپلود فایل، دکمه «اجرا» را در همان بخش بزنید.")
        else:
            tips.append("این ایجنت گفت‌وگوی آزاد ندارد — از اقدامات استفاده کنید.")
    if caps.get("can_call_agents"):
        tips.append("می‌تواند ایجنت‌های دیگر را به‌عنوان ابزار فراخوانی کند.")
    if slug_seed:
        for t in slug_seed.get("tips") or []:
            if t not in tips:
                tips.append(t)

    return {
        "profile": slug_seed.get("profile") if slug_seed else kind,
        "domain_label": domain_label,
        "headline": headline,
        "summary": summary,
        "responsibilities": responsibilities[:8],
        "how_to_steps": how_to[:6],
        "inputs": inputs[:8],
        "outputs": outputs[:8],
        "tips": tips[:4],
    }


def build_test_steps(
    agent: Agent,
    actions: list[AgentAction],
    templates: list[AgentPromptTemplate],
    guide: dict[str, Any],
) -> list[AgentExecutionTestStep]:
    caps = agent.capabilities or {}
    kind = _kind_value(agent.kind)
    steps: list[AgentExecutionTestStep] = []

    cap_bits = []
    if caps.get("chat_enabled"):
        cap_bits.append("گفت‌وگو")
    if caps.get("file_upload_enabled"):
        cap_bits.append("فایل")
    if caps.get("actions_enabled"):
        cap_bits.append("اقدام")
    steps.append(
        AgentExecutionTestStep(
            kind="info",
            label="آماده‌سازی",
            description=f"«{agent.name}» — {guide.get('summary', '')[:160]} · قابلیت‌ها: {', '.join(cap_bits) or '—'}",
        )
    )

    if caps.get("file_upload_enabled"):
        steps.append(
            AgentExecutionTestStep(
                kind="upload",
                label="آپلود فایل نمونه",
                description="فایل متناسب با سیاست دریافت فایل این ایجنت",
            )
        )

    if caps.get("actions_enabled") and actions:
        act = actions[0]
        steps.append(
            AgentExecutionTestStep(
                kind="action",
                label=f"اجرای «{act.label}»",
                description=act.description or guide.get("summary", "")[:120],
                action_slug=act.slug,
            )
        )

    if caps.get("supervisor_enabled"):
        steps.append(
            AgentExecutionTestStep(
                kind="graph",
                label="بررسی گراف سرپرست",
                description="نمایش زیرایجنت‌های متصل و مسیر مسیریابی",
            )
        )

    if caps.get("external_apis_enabled"):
        steps.append(
            AgentExecutionTestStep(
                kind="invoke",
                label="تست API خارجی",
                description="فراخوانی endpoint متصل و خلاصه نتیجه",
                prompt=(
                    f"تست ادمین برای «{agent.name}»: از API خارجی متصل یک درخواست نمونه بزن "
                    "و پاسخ را در ۳ bullet خلاصه کن."
                ),
            )
        )

    if caps.get("can_call_agents"):
        steps.append(
            AgentExecutionTestStep(
                kind="invoke",
                label="تست فراخوانی ایجنت",
                description="فراخوانی ایجنت متصل به‌عنوان ابزار",
                prompt=(
                    f"تست ادمین برای «{agent.name}»: یک ایجنت متصل را برای تکمیل "
                    "درخواست نمونه فراخوانی کن و نتیجه را برگردان."
                ),
            )
        )

    if caps.get("chat_enabled"):
        prompt = templates[0].body if templates else None
        if not prompt:
            if kind == "supervisor":
                prompt = (
                    f"تست ادمین برای «{agent.name}»: درخواست نمونه بنویس و به زیرایجنت مناسب مسیریابی کن."
                )
            else:
                prompt = (
                    f"تست ادمین برای ایجنت «{agent.name}». "
                    f"{guide.get('summary', '')[:200]} "
                    "یک پاسخ کوتاه و عملی بده."
                )
        steps.append(
            AgentExecutionTestStep(
                kind="invoke",
                label="تست گفت‌وگو" if kind != "supervisor" else "تست مسیریابی",
                description=prompt[:140] + ("…" if len(prompt) > 140 else ""),
                prompt=prompt,
            )
        )

    if len(steps) == 1:
        steps.append(
            AgentExecutionTestStep(
                kind="info",
                label="تست محدود",
                description="قابلیت اجرای خودکار فعال نیست — راهنمای بالا را دنبال کنید.",
            )
        )

    return steps


def _build_llm() -> ChatOpenAI | None:
    resolved = llm_runtime.resolve()
    if not resolved.api_key:
        return None
    kwargs: dict = {
        "model": resolved.model,
        "api_key": resolved.api_key,
        "timeout": 90,
        "max_retries": 0,
    }
    if _supports_temperature(resolved.model):
        kwargs["temperature"] = 0.35
    if resolved.base_url:
        kwargs["base_url"] = resolved.base_url
    if resolved.provider == "cursor":
        kwargs["use_responses_api"] = False
    return ChatOpenAI(**kwargs)


def _parse_llm_json(text: str) -> dict[str, Any] | None:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        data = json.loads(text)
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", text)
        if not match:
            return None
        try:
            data = json.loads(match.group())
            return data if isinstance(data, dict) else None
        except json.JSONDecodeError:
            return None


def _merge_llm_guide(base: dict[str, Any], llm: dict[str, Any]) -> dict[str, Any]:
    out = dict(base)
    for key in ("summary", "domain_label", "headline"):
        if isinstance(llm.get(key), str) and llm[key].strip():
            out[key] = llm[key].strip()
    for key in ("responsibilities", "how_to_steps", "inputs", "outputs", "tips"):
        val = llm.get(key)
        if isinstance(val, list) and val:
            cleaned = [str(x).strip() for x in val if str(x).strip()]
            if cleaned:
                out[key] = cleaned[:8]
    return out


async def enhance_guide_with_llm(
    agent: Agent,
    base: dict[str, Any],
    actions: list[AgentAction],
    templates: list[AgentPromptTemplate],
) -> dict[str, Any] | None:
    llm = _build_llm()
    if not llm:
        return None

    caps = agent.capabilities or {}
    action_lines = [
        f"- {a.label} ({a.slug}): {a.description or 'بدون توضیح'}"
        for a in actions
    ]
    tpl_lines = [f"- {t.label}: {t.body[:100]}" for t in templates[:5]]

    sys = (
        "You write Persian (fa-IR) UX copy for an enterprise AI agent execution page. "
        "Expand the admin's description into clear, specific guidance — never generic filler. "
        "Return ONLY valid JSON with keys: summary, responsibilities (array 3-5), "
        "how_to_steps (array 3-5), inputs (array), outputs (array), tips (array 0-2). "
        "Match agent kind and enabled capabilities. Mention concrete action names when present."
    )
    user = "\n".join(
        [
            f"نام: {agent.name}",
            f"بخش: {agent.department or '—'}",
            f"نوع: {_kind_value(agent.kind)}",
            f"توضیح ادمین: {(agent.description or '—').strip()}",
            f"قابلیت‌ها: {json.dumps(caps, ensure_ascii=False)}",
            f"ابزارها: {', '.join(agent.tool_names or []) or '—'}",
            "اقدامات:",
            *(action_lines or ["—"]),
            "قالب‌ها:",
            *(tpl_lines or ["—"]),
            "پیش‌نویس فعلی:",
            json.dumps(
                {
                    "summary": base.get("summary"),
                    "responsibilities": base.get("responsibilities"),
                    "how_to_steps": base.get("how_to_steps"),
                    "inputs": base.get("inputs"),
                    "outputs": base.get("outputs"),
                },
                ensure_ascii=False,
            ),
        ]
    )

    try:
        result = await llm.ainvoke(
            [{"role": "system", "content": sys}, {"role": "user", "content": user}]
        )
        text = (getattr(result, "content", None) or str(result)).strip()
        parsed = _parse_llm_json(text)
        if not parsed:
            return None
        return _merge_llm_guide(base, parsed)
    except Exception:  # noqa: BLE001
        return None


async def resolve_execution_guide(
    db: AsyncSession,
    agent: Agent,
    actions: list[AgentAction],
    templates: list[AgentPromptTemplate],
    *,
    force_refresh: bool = False,
) -> tuple[dict[str, Any], list[AgentExecutionTestStep], str]:
    """Returns (guide_dict, test_steps, source). source: cached | llm | rule.

    Normal GET reads cache or rule-based copy only (fast). LLM enhancement runs when
    force_refresh=True — scheduled after training complete / agent updates, not on tab load.
    """
    fp = guide_fingerprint(agent, actions, templates)
    cfg = dict(agent.config_json or {})
    cache = dict(cfg.get("execution_guide") or {})

    if not force_refresh and cache.get("fingerprint") == fp and cache.get("guide"):
        guide = dict(cache["guide"])
        steps_raw = cache.get("test_steps") or []
        steps = [AgentExecutionTestStep.model_validate(s) for s in steps_raw]
        return guide, steps, "cached"

    base = build_rule_based_guide(agent, actions, templates)
    if force_refresh:
        enhanced = await enhance_guide_with_llm(agent, base, actions, templates)
        if enhanced:
            guide = enhanced
            source = "llm"
        else:
            guide = base
            source = "rule"
    else:
        guide = base
        source = "rule"

    test_steps = build_test_steps(agent, actions, templates, guide)

    cfg["execution_guide"] = {
        "fingerprint": fp,
        "guide": guide,
        "test_steps": [s.model_dump() for s in test_steps],
        "source": source,
    }
    cfg = mark_execution_guide_ready(cfg, source)
    agent.config_json = cfg
    await db.commit()
    await db.refresh(agent)

    return guide, test_steps, source
