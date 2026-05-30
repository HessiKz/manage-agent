"""Notification schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from src.models.notification import NotificationSeverity


class NotificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    title: str
    message: str
    severity: NotificationSeverity
    link: str | None
    is_read: bool
    created_at: datetime


class NotificationCount(BaseModel):
    unread: int
