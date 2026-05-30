"""Agent prompt template schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AgentPromptTemplateBase(BaseModel):
    slug: str = Field(..., min_length=1, max_length=100)
    label: str = Field(..., min_length=1, max_length=255)
    body: str = Field(..., min_length=1)
    variables: dict = Field(default_factory=dict)
    order_index: int = 0


class AgentPromptTemplateCreate(AgentPromptTemplateBase):
    pass


class AgentPromptTemplateUpdate(BaseModel):
    label: str | None = None
    body: str | None = None
    variables: dict | None = None
    order_index: int | None = None


class AgentPromptTemplateRead(AgentPromptTemplateBase):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    agent_id: UUID
    created_at: datetime
    updated_at: datetime
