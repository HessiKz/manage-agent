"""Agent schemas."""

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_serializer, model_validator

from src.config import settings

from src.models.agent import AgentKind, AgentStatus, canonical_agent_kind
from src.schemas.agent_action import AgentActionCreate, AgentActionRead
from src.schemas.agent_capabilities import (
    AgentCapabilities,
    AgentFilePolicy,
    AgentLinkPolicy,
    capabilities_for_kind,
    file_policy_for_kind,
)
from src.schemas.agent_api_bindings import (
    AgentApiBindings,
    merge_api_bindings_into_config,
    parse_api_bindings,
)
from src.schemas.agent_link import AgentLinkCreate, AgentLinkRead
from src.schemas.agent_template import AgentPromptTemplateCreate, AgentPromptTemplateRead


class AgentBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    department: str | None = None
    kind: AgentKind = AgentKind.CHAT
    capabilities: AgentCapabilities = Field(default_factory=AgentCapabilities)
    file_policy: AgentFilePolicy = Field(default_factory=AgentFilePolicy)
    agent_link_policy: AgentLinkPolicy = Field(default_factory=AgentLinkPolicy)
    model_provider: str = "openai"
    model_name: str = "auto"
    temperature: float = Field(0.2, ge=0.0, le=2.0)
    max_iterations: int = Field(20, ge=1, le=100)
    system_prompt: str | None = None
    tool_names: list[str] = []
    memory_type: str = "buffer"
    memory_config: dict = {}
    cost_limit_monthly: Decimal | None = None
    cost_limit_daily: Decimal | None = None
    overtime_threshold_hours: int | None = None
    config_json: dict = {}

    @model_validator(mode="after")
    def validate_file_policy_when_upload(self):
        caps = self.capabilities
        if caps.file_upload_enabled:
            fp = self.file_policy
            if not fp.allowed_mime_types and not fp.allowed_extensions:
                raise ValueError("file_policy must include allowed_mime_types or allowed_extensions")
        return self


class AgentPermissionGrant(BaseModel):
    user_id: UUID
    can_invoke: bool = True
    can_configure: bool = False


class AgentCreate(AgentBase):
    slug: str | None = None
    permissions: list[AgentPermissionGrant] = []
    actions: list[AgentActionCreate] = []
    templates: list[AgentPromptTemplateCreate] = []
    links: list[AgentLinkCreate] = []
    api_bindings: AgentApiBindings | None = None

    @model_validator(mode="before")
    @classmethod
    def apply_kind_presets(cls, data: dict) -> dict:
        if not isinstance(data, dict):
            return data
        kind_raw = data.get("kind", AgentKind.CHAT)
        kind = canonical_agent_kind(kind_raw if kind_raw is not None else AgentKind.CHAT)
        data["kind"] = kind
        caps = data.get("capabilities")
        if caps is None or (isinstance(caps, dict) and not caps):
            data["capabilities"] = capabilities_for_kind(kind)
        elif isinstance(caps, dict):
            data["capabilities"] = capabilities_for_kind(kind, caps)
        fp = data.get("file_policy")
        if fp is None or (isinstance(fp, dict) and not fp):
            data["file_policy"] = file_policy_for_kind(kind)
        elif isinstance(fp, dict):
            data["file_policy"] = file_policy_for_kind(kind, fp)
        api_bindings = data.pop("api_bindings", None)
        cfg = data.get("config_json") or {}
        if not isinstance(cfg, dict):
            cfg = {}
        if api_bindings is not None:
            if isinstance(api_bindings, AgentApiBindings):
                bindings = api_bindings
            elif isinstance(api_bindings, dict):
                bindings = AgentApiBindings.model_validate(api_bindings)
            else:
                bindings = None
            data["config_json"] = merge_api_bindings_into_config(cfg, bindings)
        elif caps.get("external_apis_enabled") if isinstance(caps, dict) else getattr(
            caps, "external_apis_enabled", False
        ):
            data["config_json"] = merge_api_bindings_into_config(cfg, AgentApiBindings())
        return data

    @model_validator(mode="after")
    def validate_api_bindings_when_enabled(self) -> "AgentCreate":
        caps = self.capabilities
        needs_api = caps.external_apis_enabled
        if needs_api and parse_api_bindings(self.config_json).is_empty():
            raise ValueError(
                "At least one external API service or endpoint must be selected"
            )
        return self


class AgentUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    department: str | None = None
    kind: AgentKind | None = None
    capabilities: AgentCapabilities | None = None
    file_policy: AgentFilePolicy | None = None
    agent_link_policy: AgentLinkPolicy | None = None
    status: AgentStatus | None = None
    model_provider: str | None = None
    model_name: str | None = None
    temperature: float | None = Field(None, ge=0.0, le=2.0)
    max_iterations: int | None = Field(None, ge=1, le=100)
    system_prompt: str | None = None
    tool_names: list[str] | None = None
    memory_type: str | None = None
    memory_config: dict | None = None
    cost_limit_monthly: Decimal | None = None
    cost_limit_daily: Decimal | None = None
    overtime_threshold_hours: int | None = None
    config_json: dict | None = None
    api_bindings: AgentApiBindings | None = None

    @model_validator(mode="before")
    @classmethod
    def merge_api_bindings(cls, data: dict) -> dict:
        if not isinstance(data, dict):
            return data
        api_bindings = data.pop("api_bindings", None)
        if api_bindings is None:
            return data
        cfg = data.get("config_json") or {}
        if not isinstance(cfg, dict):
            cfg = {}
        if isinstance(api_bindings, dict):
            bindings = AgentApiBindings.model_validate(api_bindings)
        elif isinstance(api_bindings, AgentApiBindings):
            bindings = api_bindings
        else:
            bindings = None
        data["config_json"] = merge_api_bindings_into_config(cfg, bindings)
        return data


class AgentRead(AgentBase):
    """List/summary shape — no nested relations (avoids async lazy-load)."""

    model_config = ConfigDict(from_attributes=True)
    id: UUID
    slug: str
    status: AgentStatus
    owner_id: UUID | None
    created_at: datetime
    updated_at: datetime

    @field_serializer("kind")
    def serialize_kind(self, kind: AgentKind) -> str:
        return kind.canonical().value


class AgentDetailRead(AgentRead):
    """Full agent with nested actions, templates, links (requires eager load)."""

    actions: list[AgentActionRead] = []
    templates: list[AgentPromptTemplateRead] = []
    links: list[AgentLinkRead] = []


class AgentInvokeRequest(BaseModel):
    """Request to invoke an agent."""

    input: str = Field(..., min_length=1)
    thread_id: str | None = None
    stream: bool = False
    action_slug: str | None = None


class ExecutionTraceStep(BaseModel):
    step: int | None = None
    kind: str
    label: str
    detail: str | None = None
    payload: dict | None = None


class AgentInvokeResponse(BaseModel):
    output: str
    tokens_input: int = 0
    tokens_output: int = 0
    cost_usd: Decimal = Decimal(0)
    duration_ms: int = 0
    activity_log_id: UUID | None = None
    execution_trace: list[ExecutionTraceStep] = Field(default_factory=list)
    llm_provider: str | None = None
    model_name: str | None = None


class AgentRouteRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=2000)


class AgentRouteResponse(BaseModel):
    agent: dict | None = None
    confidence: float = 0.0
    reason: str = ""
