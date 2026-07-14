"""Sandbox resource quotas + operator kill-switch (Phase 3 M5).

All gates are P0 safety controls. The kill-switch, once enabled via the admin
panel (PlatformSetting sandbox_kill_switch = true), rejects EVERY sandbox
submission within a single request. Quotas bound concurrent jobs per org and
daily jobs per org.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.core.errors import AppError, ErrorCode
from src.models.execution_job import ExecutionJob, ExecutionJobStatus
from src.models.platform_setting import PlatformSetting

ORG_MAX_CONCURRENT = 3
ORG_MAX_DAILY = 100
ORG_MAX_ARTIFACT_BYTES = 104_857_600
KILL_SWITCH_KEY = "sandbox_kill_switch"


class SandboxQuotaService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def kill_switch_active(self) -> bool:
        row = (
            await self.db.execute(
                select(PlatformSetting).where(PlatformSetting.key == KILL_SWITCH_KEY)
            )
        ).scalar_one_or_none()
        if row is None:
            return False
        return bool(row.value is True or (isinstance(row.value, dict) and row.value.get("enabled")))

    async def concurrent_count(self, org_id: Any) -> int:
        if org_id is None:
            return 0
        c = (
            await self.db.execute(
                select(func.count(ExecutionJob.id)).where(
                    ExecutionJob.org_id == org_id,
                    ExecutionJob.status.in_(
                        [ExecutionJobStatus.QUEUED, ExecutionJobStatus.RUNNING]
                    ),
                )
            )
        ).scalar_one()
        return int(c or 0)

    async def daily_count(self, org_id: Any) -> int:
        if org_id is None:
            return 0
        since = datetime.now(timezone.utc) - timedelta(days=1)
        c = (
            await self.db.execute(
                select(func.count(ExecutionJob.id)).where(
                    ExecutionJob.org_id == org_id,
                    ExecutionJob.created_at >= since,
                )
            )
        ).scalar_one()
        return int(c or 0)

    async def check_and_consume(self, org_id: Any, spec: dict) -> tuple[bool, str]:
        if not settings.sandbox_execution_enabled:
            return False, "sandbox execution is disabled"
        if await self.kill_switch_active():
            return False, "sandbox kill-switch is active (operator-stopped)"
        if org_id is not None:
            concurrent = await self.concurrent_count(org_id)
            if concurrent >= ORG_MAX_CONCURRENT:
                return False, (
                    f"org concurrent sandbox limit reached ({ORG_MAX_CONCURRENT})"
                )
            daily = await self.daily_count(org_id)
            if daily >= ORG_MAX_DAILY:
                return False, f"org daily sandbox limit reached ({ORG_MAX_DAILY})"
        return True, "ok"

    async def set_kill_switch(self, enabled: bool) -> None:
        row = (
            await self.db.execute(
                select(PlatformSetting).where(PlatformSetting.key == KILL_SWITCH_KEY)
            )
        ).scalar_one_or_none()
        if row is None:
            row = PlatformSetting(key=KILL_SWITCH_KEY, value=enabled)
            self.db.add(row)
        else:
            row.value = enabled
        await self.db.commit()
