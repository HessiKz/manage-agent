"""Observability for sandbox execution + skill usage (Phase 3 M5)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.execution_job import ExecutionJob, ExecutionJobStatus
from src.models.platform_skill import PlatformSkill
from src.services.failure_ledger_service import FailureLedgerService


class ObservabilityService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def sandbox_success_rate(
        self, agent_id: Any | None = None, since_days: int = 14
    ) -> float:
        since = datetime.now(timezone.utc) - timedelta(days=since_days)
        stmt = select(
            func.count(ExecutionJob.id),
            func.sum(
                select(func.count(ExecutionJob.id))
                .where(ExecutionJob.status == ExecutionJobStatus.SUCCEEDED)
                .correlate(ExecutionJob)
                .scalar_subquery()
            ),
        ).where(ExecutionJob.created_at >= since)
        if agent_id is not None:
            stmt = stmt.where(ExecutionJob.agent_id == agent_id)
        total_row = (await self.db.execute(stmt)).first()
        # Simpler, correct aggregation:
        rows = (
            await self.db.execute(
                select(ExecutionJob.status, func.count(ExecutionJob.id))
                .where(ExecutionJob.created_at >= since)
                .group_by(ExecutionJob.status)
            )
        ).all()
        counts: dict[str, int] = {str(r[0]): r[1] for r in rows}
        terminal = (
            counts.get("succeeded", 0)
            + counts.get("failed", 0)
            + counts.get("timed_out", 0)
            + counts.get("cancelled", 0)
        )
        if terminal == 0:
            return 0.0
        return round(counts.get("succeeded", 0) / terminal, 4)

    async def agent_skill_usage(
        self, agent_id: Any, since_days: int = 14
    ) -> list[dict[str, Any]]:
        since = datetime.now(timezone.utc) - timedelta(days=since_days)
        rows = (
            await self.db.execute(
                select(PlatformSkill)
                .where(PlatformSkill.agent_id == agent_id)
            )
        ).scalars().all()
        out = []
        for s in rows:
            stats = s.stats or {}
            out.append(
                {
                    "slug": s.slug,
                    "name": s.name,
                    "version": s.version,
                    "success_count": stats.get("success_count", 0),
                    "failure_count": stats.get("failure_count", 0),
                }
            )
        return out

    async def recent_failures(self, scope: str = "sandbox", limit: int = 20) -> list[dict]:
        return await FailureLedgerService(self.db).top(limit=limit)
