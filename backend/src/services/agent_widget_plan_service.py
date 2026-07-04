"""Parse and enforce per-agent dashboard widget plans."""

from __future__ import annotations

import re

from fastapi import HTTPException

from src.models.agent import Agent
from src.schemas.agent_dashboard import (
    AgentDashboardReviewColumn,
    AgentDashboardReviewRow,
    AgentDashboardReviewTable,
)
from src.schemas.agent_dashboard_config import AgentDashboardCustomConfig
from src.schemas.agent_widget_plan import (
    ALL_WIDGET_PLAN_KINDS,
    AgentWidgetPlan,
    ChartWidgetSpec,
    HrSavingsWidgetSpec,
    ReviewWidgetSpec,
    StatCardsWidgetSpec,
    WidgetPlanKind,
)

WIDGET_PLAN_CONFIG_KEY = "widget_plan"


def default_widget_plan(*, department: str | None = None) -> AgentWidgetPlan:
    hr = department in ("hr", "human_resources", "payroll")
    return AgentWidgetPlan(
        hr_savings=HrSavingsWidgetSpec(enabled=hr),
    )


def parse_widget_plan(agent: Agent) -> AgentWidgetPlan:
    raw = (agent.config_json or {}).get(WIDGET_PLAN_CONFIG_KEY)
    dept = agent.department if isinstance(getattr(agent, "department", None), str) else None
    desc = agent.description if isinstance(getattr(agent, "description", None), str) else ""
    if raw is None:
        # Legacy agents (pre widget_plan): keep all widgets addable
        return AgentWidgetPlan(
            stat_cards=StatCardsWidgetSpec(enabled=True),
            line_chart=ChartWidgetSpec(enabled=True),
            pie_chart=ChartWidgetSpec(enabled=True),
            review_table=ReviewWidgetSpec(
                enabled=True,
                scope=desc[:500] or None,
            ),
            hr_savings=HrSavingsWidgetSpec(
                enabled=dept in ("hr", "human_resources", "payroll")
            ),
        )
    if isinstance(raw, dict):
        try:
            return AgentWidgetPlan.model_validate(raw)
        except Exception:  # noqa: BLE001
            pass
    return default_widget_plan(department=dept)


def widget_plan_to_config_json(plan: AgentWidgetPlan) -> dict:
    return {WIDGET_PLAN_CONFIG_KEY: plan.model_dump(mode="json")}


def assert_widget_enabled(agent: Agent, kind: WidgetPlanKind) -> None:
    plan = parse_widget_plan(agent)
    if not plan.is_enabled(kind):
        labels = {
            "stat_cards": "کارت KPI",
            "line_chart": "نمودار خطی",
            "pie_chart": "نمودار دایره‌ای",
            "review_table": "جدول بازبینی",
            "hr_savings": "صرفه‌جویی نیروی انسانی",
        }
        raise HTTPException(
            status_code=422,
            detail=(
                f"ویجت «{labels.get(kind, kind)}» در مرحله ساخت ایجنت فعال نشده — "
                "ابتدا در ویزارد ساخت آن را روشن کنید."
            ),
        )


def apply_widget_plan_to_raw(agent: Agent, raw: dict) -> dict:
    """Strip demo/LLM dashboard payload widgets the wizard disabled."""
    plan = parse_widget_plan(agent)
    out = dict(raw)
    if not plan.stat_cards.enabled:
        out["stat_cards"] = []
    if not plan.line_chart.enabled:
        out["line_chart"] = None
    if not plan.pie_chart.enabled:
        out["pie_chart"] = None
    if not plan.review_table.enabled:
        out["review_table"] = None
    if not plan.hr_savings.enabled:
        out["_hide_hr_savings"] = True
    return out


def format_plan_for_llm(plan: AgentWidgetPlan) -> str:
    lines = [
        "برنامه ویجت‌های داشبورد (الزامی — فقط موارد «فعال» را بساز؛ بقیه حتماً null یا []):",
        "هر ویجت «غیرفعال» را هرگز در JSON نگذار — مقدارش null (یا stat_cards: []) باشد.",
    ]
    if plan.stat_cards.enabled:
        hint = "؛ ".join(plan.stat_cards.hints[:4]) if plan.stat_cards.hints else "—"
        lines.append(f"- stat_cards: فعال — KPIها: {hint}")
    else:
        lines.append("- stat_cards: غیرفعال — null/[]")
    if plan.line_chart.enabled:
        lines.append(f"- line_chart: فعال — {plan.line_chart.hint or 'روند مرتبط با ایجنت'}")
    else:
        lines.append("- line_chart: غیرفعال — null")
    if plan.pie_chart.enabled:
        lines.append(f"- pie_chart: فعال — {plan.pie_chart.hint or 'توزیع مرتبط با ایجنت'}")
    else:
        lines.append("- pie_chart: غیرفعال — حتماً null (نمودار دایره‌ای ممنوع)")
    if plan.review_table.enabled:
        title = plan.review_table.title or "موارد نیازمند بررسی"
        items = _review_items_from_plan(plan)
        scope = "؛ ".join(items[:12]) if items else (plan.review_table.scope or "خروجی‌های ایجنت")
        lines.append(
            f"- review_table: فعال — عنوان: «{title}» — قوانین هشدار: {scope[:800]}"
        )
        lines.append(
            "  ردیف‌های جدول باید دقیقاً همین موارد بررسی را منعکس کنند (نه داده عمومی)."
        )
    else:
        lines.append("- review_table: غیرفعال — null")
    if plan.hr_savings.enabled:
        lines.append("- hr_savings: فعال")
    else:
        lines.append("- hr_savings: غیرفعال")
    return "\n".join(lines)


def _review_items_from_plan(plan: AgentWidgetPlan) -> list[str]:
    rt = plan.review_table
    if rt.alert_rules:
        items: list[str] = []
        for rule in rt.alert_rules:
            desc = (rule.description or "").strip()
            if not desc:
                continue
            thresh = (rule.threshold or "").strip()
            items.append(f"{desc} — آستانه: {thresh}" if thresh else desc)
        if items:
            return items
    scope = (rt.scope or "").strip()
    if not scope:
        return []
    return [p.strip() for p in re.split(r"[\n؛;]+", scope) if p.strip()]


def review_table_from_plan(agent: Agent, plan: AgentWidgetPlan) -> AgentDashboardReviewTable | None:
    if not plan.review_table.enabled:
        return None
    name = agent.name if isinstance(getattr(agent, "name", None), str) else "ایجنت"
    desc = agent.description if isinstance(getattr(agent, "description", None), str) else ""
    title = (plan.review_table.title or f"موارد نیازمند بررسی — {name}").strip()
    parts = _review_items_from_plan(plan)
    if not parts:
        fallback = (plan.review_table.scope or desc or "خروجی‌های ایجنت").strip()
        parts = [fallback[:120]] if fallback else ["موارد نیازمند بررسی"]
    rows: list[AgentDashboardReviewRow] = []
    for i, item in enumerate(parts[:8]):
        rows.append(
            AgentDashboardReviewRow(
                id=f"review-{i + 1}",
                cells={
                    "item": str(item),
                    "status": "در انتظار بررسی",
                    "context": (desc or name)[:80],
                },
                status="pending",
            )
        )
    return AgentDashboardReviewTable(
        title=title,
        columns=[
            AgentDashboardReviewColumn(key="item", label="مورد"),
            AgentDashboardReviewColumn(key="status", label="وضعیت"),
            AgentDashboardReviewColumn(key="context", label="زمینه"),
        ],
        rows=rows,
    )


def enforce_widget_plan(
    config: AgentDashboardCustomConfig, agent: Agent
) -> AgentDashboardCustomConfig:
    plan = parse_widget_plan(agent)
    disabled = [k for k in ALL_WIDGET_PLAN_KINDS if k not in plan.enabled_kinds()]

    if "stat_cards" in disabled:
        config.stat_cards = []
    if "line_chart" in disabled:
        config.line_chart = None
    if "pie_chart" in disabled:
        config.pie_chart = None
    if "review_table" in disabled:
        config.review_table = None
    elif plan.review_table.enabled and (
        config.review_table is None or not config.review_table.rows
    ):
        config.review_table = review_table_from_plan(agent, plan)

    merged_disabled = set(config.disabled_widgets or []) | set(disabled)
    if "hr_savings" in disabled:
        merged_disabled.add("hr_savings")
    else:
        merged_disabled.discard("hr_savings")
    config.disabled_widgets = list(merged_disabled)
    return config
