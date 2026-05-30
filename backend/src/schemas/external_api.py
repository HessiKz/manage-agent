"""External API schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from src.models.external_api import AuthType, HttpMethod


class ExternalApiEndpointCreate(BaseModel):
    name: str
    slug: str | None = None
    description: str | None = None
    path: str
    method: HttpMethod = HttpMethod.GET
    query_params_schema: dict = {}
    body_schema: dict = {}
    register_as_tool: bool = True
    is_active: bool = True


class ExternalApiEndpointRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    service_id: UUID
    name: str
    slug: str
    description: str | None
    path: str
    method: HttpMethod
    register_as_tool: bool
    is_active: bool
    created_at: datetime


class ExternalApiServiceCreate(BaseModel):
    name: str
    slug: str | None = None
    description: str | None = None
    base_url: str
    auth_type: AuthType = AuthType.NONE
    auth_config: dict = {}
    default_headers: dict = {}
    is_active: bool = True


class ExternalApiServiceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    slug: str
    description: str | None
    base_url: str
    auth_type: AuthType
    auth_config: dict
    default_headers: dict
    is_active: bool
    endpoints: list[ExternalApiEndpointRead] = []
    created_at: datetime


class ExternalApiTestRequest(BaseModel):
    params: dict = {}
    body: dict = {}


class KnowledgeIngestRequest(BaseModel):
    content: str = Field(..., min_length=10)
    agent_id: UUID | None = None
    source: str = "manual"
