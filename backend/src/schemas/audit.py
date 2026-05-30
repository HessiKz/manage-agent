"""Audit log schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class AuditLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID | None
    action: str
    resource_type: str
    resource_id: UUID | None
    changes: dict
    created_at: datetime


class PlatformEvent(BaseModel):
    """Unified event for admin feed (audit + synthetic alerts)."""

    id: str
    type: str
    message: str
    severity: str = "info"
    created_at: datetime
