"""Observability read endpoints (Phase 3 M5). Admin only."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import CurrentSuperuser
from src.database.session import get_db
from src.services.observability_service import ObservabilityService

router = APIRouter()


@router.get("/observability/sandbox-success-rate")
async def sandbox_success_rate(
    _: CurrentSuperuser,
    db: AsyncSession = Depends(get_db),
    agent_id: UUID | None = Query(None),
    since_days: int = Query(14, ge=1, le=90),
):
    return {"rate": await ObservabilityService(db).sandbox_success_rate(agent_id, since_days)}


@router.get("/observability/agent-skill-usage/{agent_id}")
async def agent_skill_usage(
    _: CurrentSuperuser,
    agent_id: UUID,
    db: AsyncSession = Depends(get_db),
    since_days: int = Query(14, ge=1, le=90),
):
    return await ObservabilityService(db).agent_skill_usage(agent_id, since_days)


@router.get("/observability/promotion-candidates")
async def promotion_candidates(
    _: CurrentSuperuser,
    db: AsyncSession = Depends(get_db),
    since_days: int = Query(14, ge=1, le=90),
):
    from src.services.skill_promotion_service import SkillPromotionService

    return await SkillPromotionService(db).promotion_candidates(since_days)
