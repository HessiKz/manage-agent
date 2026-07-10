"""Graduated autonomy policy (Phase 1 M3).

Levels:
  0 observe  — text suggestions only; no UI automation.
  1 assist   — highlight/fill; user confirms (default for new users).
  2 auto     — run bridges; pause on blockers (default for admins).
  3 unattended — full pipeline until validation; gated.

Resolution order (plan M3.1): session override > user preference > org default.
L3 is gated: superuser, an org feature flag, or >= 3 successful agent validations
in the last 30 days.
"""

from __future__ import annotations

import enum
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.models.activity_log import ActivityLog, ActivityStatus
from src.models.user import User

DEFAULT_LEVEL = 1
VALIDATION_ACTION = "agent_validation"
L3_SUCCESS_WINDOW_DAYS = 30
L3_SUCCESS_THRESHOLD = 3

# Org platform-setting key for the default support autonomy level.
AUTONOMY_DEFAULT_KEY = "default_support_autonomy_level"


class AutonomyLevel(int, enum.Enum):
    OBSERVE = 0
    ASSIST = 1
    AUTO = 2
    UNATTENDED = 3

    @classmethod
    def coerce(cls, value: Any) -> int:
        if isinstance(value, bool):
            return 1 if value else 0
        if isinstance(value, int) and 0 <= value <= 3:
            return value
        if isinstance(value, str) and value.isdigit():
            iv = int(value)
            if 0 <= iv <= 3:
                return iv
        return DEFAULT_LEVEL


def autonomy_gates_enabled() -> bool:
    return bool(getattr(settings, "graduated_autonomy_v1", False))


async def resolve_level(
    *,
    db: AsyncSession,
    user: User,
    session_override: int | None = None,
) -> int:
    """Resolve the effective autonomy level for a user in the current session."""
    if session_override is not None and 0 <= int(session_override) <= 3:
        return int(session_override)
    pref = AutonomyLevel.coerce(user.support_autonomy_level)
    if pref != DEFAULT_LEVEL:
        return pref
    org_default = await _org_default(db)
    return AutonomyLevel.coerce(org_default)


async def _org_default(db: AsyncSession) -> int:
    from src.models.platform_setting import PlatformSetting

    row = (
        await db.execute(
            select(PlatformSetting).where(PlatformSetting.key == AUTONOMY_DEFAULT_KEY)
        )
    ).scalar_one_or_none()
    level = (row.value or {}).get("level") if row else None
    return AutonomyLevel.coerce(level)


async def set_org_default(db: AsyncSession, level: int) -> int:
    from src.models.platform_setting import PlatformSetting

    level = AutonomyLevel.coerce(level)
    row = (
        await db.execute(
            select(PlatformSetting).where(PlatformSetting.key == AUTONOMY_DEFAULT_KEY)
        )
    ).scalar_one_or_none()
    if row is None:
        row = PlatformSetting(key=AUTONOMY_DEFAULT_KEY, value={"level": level})
        db.add(row)
    else:
        row.value = {**row.value, "level": level}
    await db.commit()
    await db.refresh(row)
    return level


async def _recent_validation_success_count(db: AsyncSession, user_id) -> int:
    since = datetime.now(timezone.utc) - timedelta(days=L3_SUCCESS_WINDOW_DAYS)
    count = await db.scalar(
        select(func.count()).select_from(ActivityLog).where(
            ActivityLog.user_id == user_id,
            ActivityLog.action == VALIDATION_ACTION,
            ActivityLog.status == ActivityStatus.SUCCESS,
            ActivityLog.started_at >= since,
        )
    )
    return int(count or 0)


async def can_use_level(
    *,
    db: AsyncSession,
    user: User,
    level: int,
    org_flag: bool = False,
) -> bool:
    """Whether `user` is permitted to run at `level` (esp. the L3 gate)."""
    level = AutonomyLevel.coerce(level)
    if level < AutonomyLevel.UNATTENDED:
        return True
    if user.is_superuser:
        return True
    if org_flag or getattr(settings, "graduated_autonomy_v1_l3_flag", False):
        return True
    return await _recent_validation_success_count(db, user.id) >= L3_SUCCESS_THRESHOLD
