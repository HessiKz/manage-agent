"""Build per-agent dashboard payloads (domain demo + live activity overlay)."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.demo.agent_dashboards import base_dashboard_for_agent, resolve_profile_key
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


class AgentDashboardService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.agents = AgentRepository(db)
        self.activity = ActivityRepository(db)

    async def get_for_agent_id(self, agent_id: UUID) -> AgentDashboardRead:
        agent = await self.agents.get(agent_id)
        if not agent:
            from fastapi import HTTPException

            raise HTTPException(status_code=404, detail="Agent not found")
        return await self.build(agent)

    async def build(self, agent: Agent) -> AgentDashboardRead:
        profile_key = resolve_profile_key(agent)
        raw = base_dashboard_for_agent(agent)
        stats = await self.activity.stats_for_agent(agent.id)

        # Domain KPIs stay intact — never replace with generic agent telemetry.
        stat_cards = [AgentDashboardStatCard.model_validate(c) for c in raw["stat_cards"]]

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

        return AgentDashboardRead(
            profile=raw["profile"],
            domain_label=domain_label_for_profile(profile_key),
            panel_title=panel_title_for_profile(profile_key, agent.name),
            uses_live_runs=uses_live,
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
