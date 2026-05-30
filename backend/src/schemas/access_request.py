"""Access request schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AccessRequestCreate(BaseModel):
    agent_id: UUID
    reason: str | None = Field(None, max_length=2000)


class AccessRequestRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    agent_id: UUID
    status: str
    reason: str | None
    decision_note: str | None
    decided_by: UUID | None
    created_at: datetime


class AccessRequestDecision(BaseModel):
    decision_note: str | None = Field(None, max_length=2000)
