"""Agent action schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AgentActionBase(BaseModel):
    slug: str = Field(..., min_length=1, max_length=100)
    label: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    icon: str | None = None
    input_schema: dict = Field(default_factory=dict)
    prompt_template: str = Field(..., min_length=1)
    tool_chain: list[str] = Field(default_factory=list)
    confirmation_required: bool = False
    order_index: int = 0


class AgentActionCreate(AgentActionBase):
    pass


class AgentActionUpdate(BaseModel):
    label: str | None = None
    description: str | None = None
    icon: str | None = None
    input_schema: dict | None = None
    prompt_template: str | None = None
    tool_chain: list[str] | None = None
    confirmation_required: bool | None = None
    order_index: int | None = None


class AgentActionRead(AgentActionBase):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    agent_id: UUID
    created_at: datetime
    updated_at: datetime


class AgentActionRunRequest(BaseModel):
    variables: dict = Field(default_factory=dict)
    thread_id: str | None = None
