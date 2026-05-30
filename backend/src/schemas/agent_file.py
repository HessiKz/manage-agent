"""Agent file schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class AgentFileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    agent_id: UUID
    filename: str
    mime_type: str
    size_bytes: int
    created_at: datetime
