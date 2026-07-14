"""Sandbox admin controls: kill-switch + usage (Phase 3 M5). Admin only."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import CurrentSuperuser
from src.database.session import get_db
from src.services.sandbox_quota_service import SandboxQuotaService

router = APIRouter()


class KillSwitchBody(BaseModel):
    enabled: bool


@router.get("/sandbox/kill-switch")
async def get_kill_switch(_: CurrentSuperuser, db: AsyncSession = Depends(get_db)):
    return {"enabled": await SandboxQuotaService(db).kill_switch_active()}


@router.post("/sandbox/kill-switch")
async def set_kill_switch(
    body: KillSwitchBody, _: CurrentSuperuser, db: AsyncSession = Depends(get_db)
):
    await SandboxQuotaService(db).set_kill_switch(body.enabled)
    return {"enabled": body.enabled}


@router.get("/sandbox/usage")
async def sandbox_usage(
    _: CurrentSuperuser,
    db: AsyncSession = Depends(get_db),
    org_id: str | None = Query(None),
):
    svc = SandboxQuotaService(db)
    return {
        "concurrent_jobs": await svc.concurrent_count(org_id),
        "daily_jobs": await svc.daily_count(org_id),
        "kill_switch_active": await svc.kill_switch_active(),
    }
