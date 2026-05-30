"""Agent link schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from src.models.agent_link import AgentLinkType


class AgentLinkBase(BaseModel):
    callee_agent_id: UUID
    link_type: AgentLinkType
    requires_user_permission: bool = True
    description: str | None = None


class AgentLinkCreate(AgentLinkBase):
    pass


class AgentLinkRead(AgentLinkBase):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    caller_agent_id: UUID
    created_at: datetime
    updated_at: datetime
    callee_name: str | None = None
    callee_slug: str | None = None


class AgentLinkGraphNode(BaseModel):
    id: str
    slug: str
    name: str
    kind: str


class AgentLinkGraphEdge(BaseModel):
    source: str
    target: str
    link_type: AgentLinkType


class AgentLinkGraph(BaseModel):
    nodes: list[AgentLinkGraphNode]
    edges: list[AgentLinkGraphEdge]
