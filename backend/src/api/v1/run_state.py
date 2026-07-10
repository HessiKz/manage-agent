"""Run state endpoints (scoped, owned by the authenticated user)."""

from __future__ import annotations

from fastapi import APIRouter, status

from src.api.dependencies import DB, CurrentUser
from src.models.user import User
from src.schemas.run_state import RunStatePatch, RunStateRead, RunStateUpsert
from src.services.run_state_service import (
    RunStateConflict,
    RunStateNotFound,
    RunStateService,
)

router = APIRouter(prefix="/run-state", tags=["run-state"])


@router.get("/{scope_type}/{scope_key}", response_model=RunStateRead)
async def get_run_state(scope_type: str, scope_key: str, db: DB, user: CurrentUser):
    try:
        return await RunStateService(db).get(scope_type, scope_key, user.id)
    except RunStateNotFound:
        return _empty(scope_type, scope_key, user)


@router.put("/{scope_type}/{scope_key}", response_model=RunStateRead)
async def upsert_run_state(
    scope_type: str, scope_key: str, payload: RunStateUpsert, db: DB, user: CurrentUser
):
    if payload.scope_type != scope_type or payload.scope_key != scope_key:
        raise _bad_request("scope_type/scope_key in body must match the path")
    try:
        state = await RunStateService(db).upsert(payload, user.id)
    except RunStateConflict:
        raise _conflict()
    await db.commit()
    await db.refresh(state)
    return state


@router.patch("/{scope_type}/{scope_key}", response_model=RunStateRead)
async def patch_run_state(
    scope_type: str, scope_key: str, patch: RunStatePatch, db: DB, user: CurrentUser
):
    state = await RunStateService(db).patch(scope_type, scope_key, patch, user.id)
    await db.commit()
    await db.refresh(state)
    return state


@router.delete("/{scope_type}/{scope_key}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_run_state(scope_type: str, scope_key: str, db: DB, user: CurrentUser):
    await RunStateService(db).delete(scope_type, scope_key, user.id)
    await db.commit()


def _empty(scope_type: str, scope_key: str, user: User) -> RunStateRead:
    return RunStateRead(
        id=None,  # type: ignore[arg-type]
        scope_type=scope_type,
        scope_key=scope_key,
        user_id=user.id,
        agent_id=None,
        slug=None,
        phase="unknown",
        wizard_step_index=None,
        payload={},
        version=0,
        created_at=None,  # type: ignore[arg-type]
        updated_at=None,  # type: ignore[arg-type]
    )


def _bad_request(detail: str):
    from fastapi import HTTPException

    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


def _conflict():
    from fastapi import HTTPException

    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Version conflict (optimistic lock)")
