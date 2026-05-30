"""ActivityLog repository."""

from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import func, select

from src.models.activity_log import ActivityLog, ActivityStatus
from src.repositories.base import BaseRepository


class ActivityRepository(BaseRepository[ActivityLog]):
    model = ActivityLog

    async def recent_for_agent(self, agent_id: UUID, limit: int = 20) -> list[ActivityLog]:
        stmt = (
            select(ActivityLog)
            .where(ActivityLog.agent_id == agent_id)
            .order_by(ActivityLog.started_at.desc())
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def total_cost_for_agent(self, agent_id: UUID) -> float:
        stmt = select(func.coalesce(func.sum(ActivityLog.cost_usd), 0)).where(
            ActivityLog.agent_id == agent_id
        )
        return float((await self.db.execute(stmt)).scalar_one())

    async def stats_for_agent(self, agent_id: UUID) -> dict[str, int | float]:
        total = await self.db.scalar(
            select(func.count()).where(ActivityLog.agent_id == agent_id)
        )
        success = await self.db.scalar(
            select(func.count())
            .select_from(ActivityLog)
            .where(
                ActivityLog.agent_id == agent_id,
                ActivityLog.status == ActivityStatus.SUCCESS,
            )
        )
        errors = await self.db.scalar(
            select(func.count())
            .select_from(ActivityLog)
            .where(
                ActivityLog.agent_id == agent_id,
                ActivityLog.status == ActivityStatus.ERROR,
            )
        )
        avg_ms = await self.db.scalar(
            select(func.avg(ActivityLog.duration_ms)).where(
                ActivityLog.agent_id == agent_id,
                ActivityLog.duration_ms.isnot(None),
            )
        )
        total_duration_ms = await self.db.scalar(
            select(func.coalesce(func.sum(ActivityLog.duration_ms), 0)).where(
                ActivityLog.agent_id == agent_id,
                ActivityLog.duration_ms.isnot(None),
            )
        )
        tokens_in = await self.db.scalar(
            select(func.coalesce(func.sum(ActivityLog.tokens_input), 0)).where(
                ActivityLog.agent_id == agent_id
            )
        )
        tokens_out = await self.db.scalar(
            select(func.coalesce(func.sum(ActivityLog.tokens_output), 0)).where(
                ActivityLog.agent_id == agent_id
            )
        )
        cost = await self.total_cost_for_agent(agent_id)
        return {
            "total": int(total or 0),
            "success": int(success or 0),
            "errors": int(errors or 0),
            "avg_duration_ms": int(avg_ms or 0),
            "total_duration_ms": int(total_duration_ms or 0),
            "tokens_input": int(tokens_in or 0),
            "tokens_output": int(tokens_out or 0),
            "cost_usd": cost,
        }

    async def daily_runs_for_agent(
        self, agent_id: UUID, *, days: int = 30
    ) -> list[tuple[str, int]]:
        since = datetime.now(timezone.utc) - timedelta(days=days)
        day_col = func.date_trunc("day", ActivityLog.started_at).label("day")
        stmt = (
            select(day_col, func.count())
            .where(ActivityLog.agent_id == agent_id, ActivityLog.started_at >= since)
            .group_by(day_col)
            .order_by(day_col)
        )
        rows = (await self.db.execute(stmt)).all()
        out: list[tuple[str, int]] = []
        for day, count in rows:
            if day is None:
                continue
            label = day.strftime("%m/%d") if hasattr(day, "strftime") else str(day)[:10]
            out.append((label, int(count)))
        return out
