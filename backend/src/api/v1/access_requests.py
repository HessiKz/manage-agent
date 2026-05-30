"""Access request endpoints (Page 6)."""

from uuid import UUID

from fastapi import APIRouter, Query, status

from src.api.dependencies import DB, CurrentSuperuser, CurrentUser
from src.models.access_request import AccessRequestStatus
from src.schemas.access_request import (
    AccessRequestCreate,
    AccessRequestDecision,
    AccessRequestRead,
)
from src.services.access_request_service import AccessRequestService

router = APIRouter()


@router.post("", response_model=AccessRequestRead, status_code=status.HTTP_201_CREATED)
async def create_request(payload: AccessRequestCreate, db: DB, user: CurrentUser):
    ar = await AccessRequestService(db).create(user.id, payload.agent_id, payload.reason)
    await db.commit()
    return ar


@router.get("", response_model=list[AccessRequestRead])
async def list_requests(
    db: DB,
    _admin: CurrentSuperuser,
    status_filter: str | None = Query(None, alias="status"),
    limit: int = Query(50, ge=1, le=200),
):
    status_enum = None
    if status_filter:
        status_enum = AccessRequestStatus(status_filter)
    return await AccessRequestService(db).list(status=status_enum, limit=limit)


@router.post("/{request_id}/approve", status_code=204)
async def approve_request(
    request_id: UUID, payload: AccessRequestDecision, db: DB, admin: CurrentSuperuser
):
    await AccessRequestService(db).approve(request_id, admin.id, payload.decision_note)
    await db.commit()


@router.post("/{request_id}/reject", status_code=204)
async def reject_request(
    request_id: UUID, payload: AccessRequestDecision, db: DB, admin: CurrentSuperuser
):
    await AccessRequestService(db).reject(request_id, admin.id, payload.decision_note)
    await db.commit()
