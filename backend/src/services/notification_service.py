"""User notifications."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.notification import Notification, NotificationSeverity


class NotificationService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_for_user(self, user_id: UUID, *, unread_only: bool = False, limit: int = 50) -> list[Notification]:
        stmt = select(Notification).where(
            (Notification.user_id == user_id) | (Notification.user_id.is_(None))
        )
        if unread_only:
            stmt = stmt.where(Notification.is_read.is_(False))
        stmt = stmt.order_by(Notification.created_at.desc()).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def unread_count(self, user_id: UUID) -> int:
        stmt = select(func.count(Notification.id)).where(
            Notification.is_read.is_(False),
            (Notification.user_id == user_id) | (Notification.user_id.is_(None)),
        )
        return int((await self.db.execute(stmt)).scalar_one())

    async def create(
        self,
        *,
        user_id: UUID | None,
        title: str,
        message: str,
        severity: NotificationSeverity = NotificationSeverity.INFO,
        link: str | None = None,
        meta: dict | None = None,
    ) -> Notification:
        n = Notification(
            user_id=user_id,
            title=title,
            message=message,
            severity=severity,
            link=link,
            meta=meta or {},
        )
        self.db.add(n)
        await self.db.flush()
        await self.db.refresh(n)
        return n

    async def mark_read(self, notification_id: UUID, user_id: UUID) -> None:
        await self.db.execute(
            update(Notification)
            .where(Notification.id == notification_id)
            .where((Notification.user_id == user_id) | (Notification.user_id.is_(None)))
            .values(is_read=True)
        )
        await self.db.flush()

    async def mark_all_read(self, user_id: UUID) -> None:
        await self.db.execute(
            update(Notification)
            .where(
                Notification.is_read.is_(False),
                (Notification.user_id == user_id) | (Notification.user_id.is_(None)),
            )
            .values(is_read=True)
        )
        await self.db.flush()
