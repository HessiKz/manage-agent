"""Build per-agent dashboard payloads (domain demo + live activity overlay)."""

from __future__ import annotations

import uuid
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.demo.agent_dashboards import (
    base_dashboard_for_agent,
    is_catalog_agent_slug,
    resolve_profile_key,
)
from src.demo.agent_hr_benchmarks import (
    compute_hr_savings,
    domain_label_for_profile,
    panel_title_for_profile,
)
from src.models.agent import Agent
from src.models.agent_action import AgentAction
from src.models.agent_file import AgentFile
from src.models.agent_link import AgentLink
from src.models.agent_prompt_template import AgentPromptTemplate
from src.repositories.activity_repo import ActivityRepository
from src.repositories.agent_repo import AgentRepository
from src.schemas.agent_dashboard import (
    AgentDashboardHrSavings,
    AgentDashboardLineChart,
    AgentDashboardLineSeries,
    AgentDashboardPieChart,
    AgentDashboardRead,
    AgentDashboardReviewColumn,
    AgentDashboardReviewRow,
    AgentDashboardReviewTable,
    AgentDashboardRunSummary,
    AgentDashboardStatCard,
)
from src.core.debug_session_log import debug_session_log
from src.services.agent_dashboard_config_service import AgentDashboardConfigService
from src.services.agent_widget_plan_service import apply_widget_plan_to_raw


def _format_cost(usd: float) -> str:
    if usd <= 0:
        return "$0.00"
    if usd < 0.01:
        return f"${usd:.4f}"
    return f"${usd:.2f}"


def _format_duration(ms: int) -> str:
    if ms <= 0:
        return "—"
    if ms < 1000:
        return f"{ms}ms"
    return f"{ms / 1000:.1f}s"


_DEPT_DOMAIN_PREFIX: dict[str, str] = {
    "finance": "مالی",
    "hr": "منابع انسانی",
    "support": "پشتیبانی",
    "sales": "فروش",
    "ops": "عملیات",
}


def _custom_domain_label(agent: Agent, profile_key: str) -> str:
    dept = (agent.department or "ops").lower()
    prefix = _DEPT_DOMAIN_PREFIX.get(dept, "عملیات")
    name = (agent.name or "").strip()
    if name:
        return f"{prefix} · {name}"
    return domain_label_for_profile(profile_key)


class AgentDashboardService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.agents = AgentRepository(db)
        self.activity = ActivityRepository(db)

    async def get_for_agent_id(self, agent_id: UUID, *, use_draft: bool = False) -> AgentDashboardRead:
        agent = await self.agents.get(agent_id)
        if not agent:
            from fastapi import HTTPException

            raise HTTPException(status_code=404, detail="Agent not found")
        return await self.build(agent, use_draft=use_draft)

    async def build(self, agent: Agent, *, use_draft: bool = False) -> AgentDashboardRead:
        profile_key = resolve_profile_key(agent)
        raw = base_dashboard_for_agent(agent)
        config_svc = AgentDashboardConfigService(self.db)
        bucket, custom, approved = config_svc.get_stored(agent)
        stored_draft = config_svc.get_draft(agent)
        has_pending_draft = stored_draft is not None
        is_custom = False
        hide_hr = False

        if use_draft:
            overlay = stored_draft if stored_draft is not None else (custom if approved and custom else None)
            if overlay:
                raw = config_svc.apply_custom_to_raw(agent, raw, overlay)
                is_custom = True
                hide_hr = bool(raw.pop("_hide_hr_savings", False))
        elif approved and custom:
            raw = config_svc.apply_custom_to_raw(agent, raw, custom)
            is_custom = True
            hide_hr = bool(raw.pop("_hide_hr_savings", False))

        raw = apply_widget_plan_to_raw(agent, raw)
        hide_hr = hide_hr or bool(raw.pop("_hide_hr_savings", False))
        # #region agent log
        if not use_draft:
            debug_session_log(
                "agent_dashboard_service.py:build:live",
                "Live dashboard build path",
                {
                    "agent_id": str(agent.id),
                    "use_draft": use_draft,
                    "approved": approved,
                    "is_custom": is_custom,
                    "hide_hr": hide_hr,
                    "stat_cards": len(raw.get("stat_cards") or []),
                    "has_line": bool(raw.get("line_chart")),
                    "has_pie": bool(raw.get("pie_chart")),
                },
                hypothesis_id="H9",
                run_id="post-fix",
            )
        # #endregion

        stats = await self.activity.stats_for_agent(agent.id)

        # Domain KPIs stay intact — never replace with generic agent telemetry.
        stat_cards = []
        for c in raw["stat_cards"]:
            item = dict(c) if isinstance(c, dict) else c
            if isinstance(item, dict) and not item.get("id"):
                item["id"] = str(uuid.uuid4())
            stat_cards.append(AgentDashboardStatCard.model_validate(item))

        uses_live = int(stats["total"]) > 0
        run_summary = None
        if uses_live:
            run_summary = AgentDashboardRunSummary(
                total_runs=int(stats["total"]),
                success_runs=int(stats["success"]),
                error_runs=int(stats["errors"]),
                avg_duration_label=_format_duration(int(stats["avg_duration_ms"])),
                cost_label=_format_cost(float(stats["cost_usd"])),
                tokens_total=int(stats["tokens_input"]) + int(stats["tokens_output"]),
            )

        line_chart = None
        pie_chart = None
        review_table = None

        if raw.get("line_chart"):
            lc = raw["line_chart"]
            line_chart = AgentDashboardLineChart(
                title=lc["title"],
                series=[AgentDashboardLineSeries.model_validate(s) for s in lc["series"]],
                points=lc["points"],
            )

        if raw.get("pie_chart"):
            pc = raw["pie_chart"]
            pie_chart = AgentDashboardPieChart(title=pc["title"], slices=pc["slices"])

        if raw.get("review_table"):
            rt = raw["review_table"]
            review_table = AgentDashboardReviewTable(
                title=rt["title"],
                columns=[AgentDashboardReviewColumn.model_validate(c) for c in rt["columns"]],
                rows=[AgentDashboardReviewRow.model_validate(r) for r in rt["rows"]],
            )

        savings_raw = compute_hr_savings(profile_key, stats)
        hr_savings = AgentDashboardHrSavings.model_validate(savings_raw)

        catalog = is_catalog_agent_slug(agent.slug)
        panel_title = raw.get("panel_title") or (
            panel_title_for_profile(profile_key, agent.name)
            if catalog
            else f"پنل {agent.name}"
        )
        domain_label = raw.get("domain_label") or (
            domain_label_for_profile(profile_key)
            if catalog
            else _custom_domain_label(agent, profile_key)
        )

        return AgentDashboardRead(
            profile=raw.get("profile", profile_key),
            domain_label=domain_label,
            panel_title=panel_title,
            uses_live_runs=uses_live,
            is_custom=is_custom,
            hide_hr_savings=hide_hr,
            has_pending_draft=has_pending_draft,
            is_draft_preview=use_draft and has_pending_draft,
            draft_unavailable=use_draft and not has_pending_draft,
            stat_cards=stat_cards,
            line_chart=line_chart,
            pie_chart=pie_chart,
            review_table=review_table,
            run_summary=run_summary,
            hr_savings=hr_savings,
        )

    async def _file_count(self, agent_id: UUID) -> int:
        return int(
            (
                await self.db.execute(
                    select(func.count()).select_from(AgentFile).where(AgentFile.agent_id == agent_id)
                )
            ).scalar_one()
            or 0
        )

    async def _action_count(self, agent_id: UUID) -> int:
        return int(
            (
                await self.db.execute(
                    select(func.count())
                    .select_from(AgentAction)
                    .where(AgentAction.agent_id == agent_id)
                )
            ).scalar_one()
            or 0
        )

    async def _template_count(self, agent_id: UUID) -> int:
        return int(
            (
                await self.db.execute(
                    select(func.count())
                    .select_from(AgentPromptTemplate)
                    .where(AgentPromptTemplate.agent_id == agent_id)
                )
            ).scalar_one()
            or 0
        )

    async def _link_count(self, agent_id: UUID) -> int:
        return int(
            (
                await self.db.execute(
                    select(func.count()).select_from(AgentLink).where(AgentLink.caller_agent_id == agent_id)
                )
            ).scalar_one()
            or 0
        )
