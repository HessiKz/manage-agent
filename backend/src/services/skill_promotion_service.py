"""Skill A/B promotion candidates + admin-applied promotion (Phase 3 M5).

In v1 this ONLY surfaces promotion HINTS — no auto-promotion. A candidate is a
draft/learned skill with enough successful usage to be worth promoting to
active by an admin reviewing it.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.platform_skill import PlatformSkill
from src.services.skill_service import SkillService


class SkillPromotionService:
    PROMOTE_SUCCESS_COUNT = 5
    PROMOTE_SUCCESS_RATE = 0.9

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def promotion_candidates(self, since_days: int = 14) -> list[dict[str, Any]]:
        rows = (
            await self.db.execute(
                select(PlatformSkill).where(
                    PlatformSkill.status.in_(["draft", "learned"])
                )
            )
        ).scalars().all()
        out = []
        for s in rows:
            stats = s.stats or {}
            sc = int(stats.get("success_count", 0))
            fc = int(stats.get("failure_count", 0))
            total = sc + fc
            rate = (sc / total) if total else 0.0
            if sc >= self.PROMOTE_SUCCESS_COUNT and rate >= self.PROMOTE_SUCCESS_RATE:
                out.append(
                    {
                        "slug": s.slug,
                        "name": s.name,
                        "current_version": s.version,
                        "current_status": s.status,
                        "success_count": sc,
                        "failure_count": fc,
                        "success_rate": round(rate, 2),
                        "recommendation": "promote (admin review) -> active",
                    }
                )
        return out

    async def apply_promotion(self, slug: str, admin: Any) -> PlatformSkill:
        """Admin-only promotion of a draft/learned skill to active."""
        if not getattr(admin, "is_superuser", False):
            from src.core.errors import AppError, ErrorCode

            raise AppError("admin only", code=ErrorCode.FORBIDDEN, status_code=403)
        return await SkillService(self.db).activate(slug)
