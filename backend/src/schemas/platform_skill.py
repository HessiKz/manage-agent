"""Pydantic v2 schemas for the platform_skills table."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from src.models.platform_skill import SkillScope, SkillSource, SkillStatus

# Step type union — mirrors frontend/src/lib/support-ui-script.ts SupportUiStep.
# The full TS union has many step variants; the spec asks us to validate the
# discriminated `type` against the supported set. We keep payloads permissive
# (dict) so backend does not re-implement the whole player contract.
STEP_TYPES = Literal[
    "bridge",
    "navigate",
    "click",
    "fill",
    "wait",
    "assert",
]


class SkillProcedureStep(BaseModel):
    """One step of a SupportUiScript-compatible procedure."""

    type: STEP_TYPES
    label: str | None = None
    # Optional per-type payload kept open: action/selector/ref/path/text/value/ms/pattern/assertion…
    model_config = ConfigDict(extra="allow")


class SkillProcedure(BaseModel):
    """A SupportUiScript-compatible procedure stored as JSONB."""

    label: str | None = None
    steps: list[SkillProcedureStep] = Field(default_factory=list)


class SkillTrigger(BaseModel):
    """Trigger predicates evaluated by SkillMatcher."""

    phase_any: list[str] | None = None
    pathname_prefix: str | None = None
    intent_regex: str | None = None
    run_state: dict[str, Any] | None = None
    min_autonomy_level: int | None = None
    agent_kind_any: list[str] | None = None
    priority: int | None = 100

    model_config = ConfigDict(extra="allow")


class SkillBase(BaseModel):
    """Shared skill fields (mirrors the ORM model)."""

    slug: str = Field(..., min_length=1, max_length=120)
    name: str = Field(..., min_length=1, max_length=255)
    name_fa: str | None = None
    description: str | None = None
    scope: SkillScope = SkillScope.PLATFORM
    org_id: UUID | None = None
    agent_id: UUID | None = None
    source: SkillSource = SkillSource.MANUAL
    trigger: dict[str, Any] = Field(default_factory=dict)
    procedure: dict[str, Any] = Field(default_factory=dict)
    content_md: str | None = None


class SkillCreate(SkillBase):
    @model_validator(mode="after")
    def agent_scope_requires_agent_id(self) -> "SkillCreate":
        if self.scope == SkillScope.AGENT and self.agent_id is None:
            raise ValueError("scope='agent' requires agent_id")
        return self


class SkillUpdate(BaseModel):
    """Partial update; procedure change bumps version."""

    name: str | None = None
    name_fa: str | None = None
    description: str | None = None
    scope: SkillScope | None = None
    org_id: UUID | None = None
    agent_id: UUID | None = None
    source: SkillSource | None = None
    status: SkillStatus | None = None
    trigger: dict[str, Any] | None = None
    procedure: dict[str, Any] | None = None
    content_md: str | None = None

    @model_validator(mode="after")
    def agent_scope_requires_agent_id(self) -> "SkillUpdate":
        if self.scope == SkillScope.AGENT and self.agent_id is None:
            # If only agent_id is cleared without touching scope, that's also invalid.
            raise ValueError("scope='agent' requires agent_id")
        return self


class SkillRead(BaseModel):
    """Read shape — mirrors the model fields, trigger & procedure as dict."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    slug: str
    name: str
    name_fa: str | None = None
    description: str | None = None
    scope: SkillScope
    org_id: UUID | None = None
    agent_id: UUID | None = None
    source: SkillSource
    status: SkillStatus
    version: int
    supersedes_id: UUID | None = None
    trigger: dict[str, Any] = Field(default_factory=dict)
    procedure: dict[str, Any] = Field(default_factory=dict)
    content_md: str | None = None
    stats: dict[str, Any] = Field(default_factory=dict)
    created_by: UUID | None = None
    created_at: datetime
    updated_at: datetime


class SkillActivateResponse(BaseModel):
    slug: str
    status: SkillStatus
    version: int


class SkillMatchRequest(BaseModel):
    run_state: dict[str, Any] = Field(default_factory=dict)
    message: str = ""
    pathname: str | None = None
    autonomy_level: int = 0


class SkillMatchResponse(BaseModel):
    skill: SkillRead | None = None
    confidence: float = 0.0
    reasons: list[str] = Field(default_factory=list)


class SkillRecordOutcomeRequest(BaseModel):
    success: bool


class SkillListResponse(BaseModel):
    items: list[SkillRead]
    total: int
