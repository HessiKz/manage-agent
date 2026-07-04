"""Upgrade seeded catalog agents when platform schema evolves."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from src.core.catalog import CATALOG_SLUGS
from src.database.full_catalog import FULL_AGENT_CATALOG
from src.demo.datasets import demo_context_for_slug
from src.models.agent import Agent, AgentKind, AgentStatus
from src.models.agent_action import AgentAction
from src.models.agent_prompt_template import AgentPromptTemplate
from src.schemas.agent_capabilities import clamp_capabilities_for_kind
from src.schemas.agent_widget_plan import (
    AgentWidgetPlan,
    ChartWidgetSpec,
    HrSavingsWidgetSpec,
    ReviewWidgetSpec,
    StatCardsWidgetSpec,
)
from src.agents_lib.platform_constants import PLATFORM_SUPPORT_TOOL_NAMES

CATALOG_SCHEMA_VERSION = 2
CATALOG_CUSTOMIZED_KEY = "_catalog_customized"

_CATALOG_BY_SLUG: dict[str, dict[str, Any]] = {e["slug"]: e for e in FULL_AGENT_CATALOG}


def catalog_agent_is_customized(config_json: dict[str, Any] | None) -> bool:
    return bool((config_json or {}).get(CATALOG_CUSTOMIZED_KEY))


def mark_catalog_agent_customized(config_json: dict[str, Any] | None) -> dict[str, Any]:
    cfg = dict(config_json or {})
    cfg[CATALOG_CUSTOMIZED_KEY] = True
    return cfg

_REVIEW_SCOPES: dict[str, tuple[str, str]] = {
    "payroll": (
        "بازبینی حقوق و اضافه‌کار",
        "اضافه‌کار غیرعادی پرسنل\nفیش‌های با مغایرت محاسبه\nدرخواست‌های اصلاح حقوق",
    ),
    "invoice": (
        "فاکتورهای نیازمند تأیید",
        "فاکتورهای معوق\nپرداخت‌های بدون تطبیق\nتأیید دسته فاکتور قبل از ارسال",
    ),
    "support": (
        "تیکت‌های نیازمند بررسی",
        "تیکت‌های با اولویت بالا\nپاسخ‌های پیشنهادی AI\nتیکت‌های بدون اختتام",
    ),
    "bank-recon": (
        "مغایرت‌های بانکی",
        "تراکنش بدون تطبیق\nاختلاف مانده بانک و دفتر\nموارد نیازمند تأیید مالی",
    ),
    "resume": (
        "رزومه‌های مرزی",
        "رزومه‌های امتیاز مرزی\nپیشنهاد رد یا دعوت به مصاحبه\nمدارک ناقص",
    ),
    "example-karkard": (
        "ردیف‌های کارکرد مشکوک",
        "ردیف‌های با کسرکار بالا\nاضافه‌کار بدون تأیید سرپرست\nستون‌های خالی موظف",
    ),
    "example-worker": (
        "خروجی‌های worker",
        "گزارش حقوق قبل از ثبت\nخطاهای اعتبارسنجی خروجی\nدرخواست‌های اصلاح",
    ),
    "example-file-intake": (
        "فایل‌های دریافتی",
        "فایل‌های ناقص یا فرمت نامعتبر\nرکوردهای تکراری\nنیاز به تأیید اپراتور",
    ),
}


def widget_plan_for_catalog_entry(entry: dict[str, Any]) -> dict[str, Any]:
    slug = entry["slug"]
    department = entry.get("department") or "ops"
    kind = entry.get("kind", AgentKind.CHAT)
    if isinstance(kind, AgentKind):
        kind_val = kind.value
    else:
        kind_val = str(kind)
    caps = entry.get("capabilities") or {}
    hr = department in ("hr", "human_resources", "payroll")

    plan = AgentWidgetPlan(
        stat_cards=StatCardsWidgetSpec(enabled=True),
        line_chart=ChartWidgetSpec(enabled=True, hint=_chart_hint(slug, "line")),
        pie_chart=ChartWidgetSpec(enabled=True, hint=_chart_hint(slug, "pie")),
        hr_savings=HrSavingsWidgetSpec(enabled=hr),
        review_table=ReviewWidgetSpec(enabled=False),
    )

    if slug in _REVIEW_SCOPES:
        title, scope = _REVIEW_SCOPES[slug]
        plan.review_table.enabled = True
        plan.review_table.title = title
        plan.review_table.scope = scope
    elif caps.get("actions_enabled") or kind_val == AgentKind.WORKER.value:
        plan.review_table.enabled = True
        plan.review_table.title = "خروجی‌های نیازمند تأیید"
        plan.review_table.scope = (
            entry.get("description") or "خروجی‌های ایجنت قبل از ثبت نهایی در سامانه"
        )

    if entry.get("widget_plan"):
        try:
            return AgentWidgetPlan.model_validate(entry["widget_plan"]).model_dump(mode="json")
        except Exception:  # noqa: BLE001
            pass
    return plan.model_dump(mode="json")


def _chart_hint(slug: str, kind: str) -> str:
    hints = {
        "payroll": ("روند پرداخت حقوق ماهانه", "سهم دپارتمان‌ها"),
        "invoice": ("روند صدور فاکتور", "وضعیت فاکتورها"),
        "support": ("حجم تیکت‌ها", "اولویت تیکت‌ها"),
        "bank-recon": ("تراکنش‌های تطبیق‌شده", "وضعیت تطبیق"),
        "resume": ("رزومه‌های پردازش‌شده", "نتیجه غربال"),
    }
    pair = hints.get(slug, ("فعالیت ایجنت", "توزیع نتایج"))
    return pair[0] if kind == "line" else pair[1]


def _tool_names_for_entry(entry: dict[str, Any]) -> list[str]:
    tools = list(entry.get("tool_names") or [])
    if entry["slug"] == "support":
        return list(PLATFORM_SUPPORT_TOOL_NAMES)
    return tools


async def upgrade_catalog_agents(db: AsyncSession) -> int:
    """Sync catalog agents with FULL_AGENT_CATALOG + widget_plan. Returns count upgraded."""
    result = await db.execute(select(Agent).where(Agent.slug.in_(CATALOG_SLUGS)))
    agents = list(result.scalars().all())
    upgraded = 0

    for agent in agents:
        entry = _CATALOG_BY_SLUG.get(agent.slug)
        if not entry:
            continue

        changed = False
        cfg = deepcopy(agent.config_json or {})
        version = int(cfg.get("_catalog_version") or 0)
        customized = catalog_agent_is_customized(cfg)

        catalog_prompt = demo_context_for_slug(agent.slug)
        catalog_description = entry.get("description")
        user_edited_prompt = (agent.system_prompt or "").strip() != catalog_prompt.strip()
        user_edited_description = bool(
            catalog_description and agent.description != catalog_description
        )
        if not customized and (user_edited_prompt or user_edited_description):
            cfg = mark_catalog_agent_customized(cfg)
            agent.config_json = cfg
            flag_modified(agent, "config_json")
            customized = True
            changed = True

        if not customized:
            expected_tools = _tool_names_for_entry(entry)
            if list(agent.tool_names or []) != expected_tools:
                agent.tool_names = expected_tools
                changed = True

            catalog_caps = clamp_capabilities_for_kind(
                agent.kind,
                {**(agent.capabilities or {}), **(entry.get("capabilities") or {})},
            )
            if dict(agent.capabilities or {}) != catalog_caps:
                agent.capabilities = catalog_caps
                changed = True

            prompt = demo_context_for_slug(agent.slug)
            if (agent.system_prompt or "").strip() != prompt.strip():
                agent.system_prompt = prompt
                changed = True

            if catalog_description and agent.description != catalog_description:
                agent.description = catalog_description
                changed = True

        if version < CATALOG_SCHEMA_VERSION or "widget_plan" not in cfg:
            cfg["widget_plan"] = widget_plan_for_catalog_entry(entry)
            cfg["_catalog_version"] = CATALOG_SCHEMA_VERSION
            agent.config_json = cfg
            flag_modified(agent, "config_json")
            changed = True

        if agent.status == AgentStatus.ACTIVE:
            validation = dict(cfg.get("validation") or {})
            if validation.get("state") not in ("training", "dashboard_review", "running"):
                if validation.get("state") != "done":
                    validation["state"] = "done"
                    validation.setdefault("training_completed", True)
                    cfg["validation"] = validation
                    agent.config_json = cfg
                    flag_modified(agent, "config_json")
                    changed = True

        if (
            not customized
            and entry.get("file_policy")
            and agent.file_policy != entry["file_policy"]
        ):
            agent.file_policy = entry["file_policy"]
            changed = True

        if changed:
            upgraded += 1

    if upgraded:
        await db.commit()
    return upgraded


async def ensure_catalog_actions_templates(db: AsyncSession) -> int:
    """Add missing actions/templates from catalog (does not remove extras)."""
    result = await db.execute(select(Agent).where(Agent.slug.in_(CATALOG_SLUGS)))
    agents = {a.slug: a for a in result.scalars().all()}
    added = 0

    for entry in FULL_AGENT_CATALOG:
        agent = agents.get(entry["slug"])
        if not agent:
            continue

        existing_actions = (
            await db.execute(select(AgentAction.slug).where(AgentAction.agent_id == agent.id))
        ).scalars().all()
        action_slugs = set(existing_actions)

        for act in entry.get("actions") or []:
            if act["slug"] in action_slugs:
                continue
            db.add(AgentAction(agent_id=agent.id, **act))
            added += 1

        existing_tpls = (
            await db.execute(
                select(AgentPromptTemplate.slug).where(AgentPromptTemplate.agent_id == agent.id)
            )
        ).scalars().all()
        tpl_slugs = set(existing_tpls)

        for tpl in entry.get("templates") or []:
            if tpl["slug"] in tpl_slugs:
                continue
            db.add(AgentPromptTemplate(agent_id=agent.id, **tpl))
            added += 1

    if added:
        await db.flush()
        await db.commit()
    return added
