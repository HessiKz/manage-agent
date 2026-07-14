"""Skill library REST endpoints (platform_skills)."""

from __future__ import annotations

from fastapi import APIRouter, Query, status

from src.api.dependencies import CurrentSuperuser, CurrentUser, DB
from src.logger import get_logger
from src.schemas.common import Page
from src.schemas.platform_skill import (
    SkillActivateResponse,
    SkillCreate,
    SkillMatchRequest,
    SkillMatchResponse,
    SkillRead,
    SkillRecordOutcomeRequest,
    SkillUpdate,
)
from src.services.skill_matcher import SkillMatcher
from src.services.skill_service import SkillService

log = get_logger("skills.api")

router = APIRouter()


@router.get("", response_model=Page[SkillRead])
async def list_skills(
    db: DB,
    _admin: CurrentSuperuser,
    scope: str | None = Query(None, description="platform | org | agent"),
    skill_status: str | None = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    """Admin: list skills with optional scope/status filters."""
    items = await SkillService(db).list(scope=scope, status=skill_status)
    total = len(items)
    start = (page - 1) * page_size
    page_items = items[start:start + page_size]
    return Page[SkillRead](
        items=[SkillRead.model_validate(s) for s in page_items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=SkillRead, status_code=status.HTTP_201_CREATED)
async def create_skill(payload: SkillCreate, db: DB, _admin: CurrentSuperuser):
    """Admin: create a manual (draft) skill."""
    return SkillRead.model_validate(await SkillService(db).create(payload, _admin))


@router.get("/{slug}", response_model=SkillRead)
async def get_skill(slug: str, db: DB, _admin: CurrentSuperuser):
    """Admin: skill detail by slug."""
    return SkillRead.model_validate(await SkillService(db).get(slug))


@router.put("/{slug}", response_model=SkillRead)
async def update_skill(slug: str, payload: SkillUpdate, db: DB, _admin: CurrentSuperuser):
    """Admin: update a skill (bumps version if procedure changes)."""
    return SkillRead.model_validate(await SkillService(db).update(slug, payload))


@router.post("/{slug}/activate", response_model=SkillActivateResponse)
async def activate_skill(slug: str, db: DB, _admin: CurrentSuperuser):
    """Admin: promote draft -> active, archiving the prior active version."""
    skill = await SkillService(db).activate(slug)
    return SkillActivateResponse(
        slug=skill.slug,
        status=skill.status,
        version=skill.version,
    )


@router.post("/match", response_model=SkillMatchResponse)
async def match_skill(payload: SkillMatchRequest, db: DB, _user: CurrentUser):
    """Authenticated: runtime best-skill match for the given context."""
    result = await SkillMatcher(db).match(
        {
            "run_state": payload.run_state,
            "message": payload.message,
            "pathname": payload.pathname,
            "autonomy_level": payload.autonomy_level,
        }
    )
    return SkillMatchResponse(
        skill=SkillRead.model_validate(result.skill) if result.skill else None,
        confidence=result.confidence,
        reasons=result.reasons,
    )


@router.post("/{slug}/record-outcome", response_model=SkillRead)
async def record_skill_outcome(
    slug: str,
    payload: SkillRecordOutcomeRequest,
    db: DB,
    _user: CurrentUser,
):
    """Authenticated: record success/failure for a skill run."""
    return SkillRead.model_validate(
        await SkillService(db).record_outcome(slug, payload.success)
    )
