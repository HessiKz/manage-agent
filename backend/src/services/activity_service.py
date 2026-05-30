"""Activity-log helpers."""

from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from src.models.activity_log import ActivityLog, ActivityStatus
from src.repositories.activity_repo import ActivityRepository


class ActivityService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = ActivityRepository(db)

    async def start(
        self,
        *,
        agent_id: UUID,
        user_id: UUID | None,
        action: str,
        input_text: str | None,
    ) -> ActivityLog:
        row = ActivityLog(
            agent_id=agent_id,
            user_id=user_id,
            action=action,
            status=ActivityStatus.RUNNING,
            input_text=input_text,
            started_at=datetime.now(timezone.utc),
        )
        row = await self.repo.create(row)
        await self.db.commit()
        await self.db.refresh(row)
        return row

    async def finish(
        self,
        row: ActivityLog,
        *,
        output_text: str | None,
        tokens_input: int = 0,
        tokens_output: int = 0,
        cost_usd: Decimal | float = 0,
        error: str | None = None,
        details: dict | None = None,
    ) -> ActivityLog:
        row.completed_at = datetime.now(timezone.utc)
        row.output_text = output_text
        row.tokens_input = tokens_input
        row.tokens_output = tokens_output
        row.cost_usd = Decimal(str(cost_usd))
        row.error_message = error
        row.status = ActivityStatus.ERROR if error else ActivityStatus.SUCCESS
        if details:
            merged = dict(row.details or {})
            merged.update(details)
            row.details = merged
        if row.started_at:
            row.duration_ms = int((row.completed_at - row.started_at).total_seconds() * 1000)
        await self.db.commit()
        await self.db.refresh(row)
        return row

    async def recent_for_agent(self, agent_id: UUID, limit: int = 20):
        return await self.repo.recent_for_agent(agent_id, limit=limit)
