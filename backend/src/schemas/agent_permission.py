"""Agent permission schemas."""

from uuid import UUID

from pydantic import BaseModel, ConfigDict


class AgentPermissionCreate(BaseModel):
    user_id: UUID
    agent_id: UUID
    can_invoke: bool = True
    can_configure: bool = False


class AgentPermissionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    user_id: UUID
    agent_id: UUID
    can_invoke: bool
    can_configure: bool


class AgentPermissionMatrix(BaseModel):
    user_id: UUID
    user_name: str
    agent_id: UUID
    agent_name: str
    can_invoke: bool
    can_configure: bool
