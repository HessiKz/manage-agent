"""Notification endpoints."""

from uuid import UUID

from fastapi import APIRouter, Query

from src.api.dependencies import DB, CurrentUser
from src.schemas.notification import NotificationCount, NotificationRead
from src.services.notification_service import NotificationService

router = APIRouter()


@router.get("", response_model=list[NotificationRead])
async def list_notifications(
    db: DB,
    user: CurrentUser,
    unread_only: bool = Query(False),
    limit: int = Query(50, ge=1, le=200),
):
    return await NotificationService(db).list_for_user(user.id, unread_only=unread_only, limit=limit)


@router.get("/count", response_model=NotificationCount)
async def notification_count(db: DB, user: CurrentUser):
    count = await NotificationService(db).unread_count(user.id)
    return NotificationCount(unread=count)


@router.post("/{notification_id}/read", status_code=204)
async def mark_read(notification_id: UUID, db: DB, user: CurrentUser):
    await NotificationService(db).mark_read(notification_id, user.id)
    await db.commit()


@router.post("/read-all", status_code=204)
async def mark_all_read(db: DB, user: CurrentUser):
    await NotificationService(db).mark_all_read(user.id)
    await db.commit()
