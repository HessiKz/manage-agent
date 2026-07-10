"""Run state Pydantic schemas."""

from __future__ import annotations

import enum
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from src.models.run_state import RunStatePhase, RunStateScope


class RunStateScopeType(str, enum.Enum):
    WIZARD = RunStateScope.WIZARD.value
    SUPPORT = RunStateScope.SUPPORT.value
    INVOKE = RunStateScope.INVOKE.value


class RunStatePhaseType(str, enum.Enum):
    UNKNOWN = RunStatePhase.UNKNOWN.value
    WIZARD_FORM = RunStatePhase.WIZARD_FORM.value
    WIZARD_STEPS = RunStatePhase.WIZARD_STEPS.value
    PUBLISH = RunStatePhase.PUBLISH.value
    PLANNING = RunStatePhase.PLANNING.value
    TRAINING = RunStatePhase.TRAINING.value
    DASHBOARD = RunStatePhase.DASHBOARD.value
    VALIDATION = RunStatePhase.VALIDATION.value
    COMPLETE = RunStatePhase.COMPLETE.value
    ERROR = RunStatePhase.ERROR.value


class RunStateBase(BaseModel):
    scope_type: RunStateScopeType
    phase: RunStatePhaseType = RunStatePhaseType.UNKNOWN
    wizard_step_index: int | None = None
    payload: dict = Field(default_factory=dict)


class RunStateUpsert(RunStateBase):
    scope_key: str
    agent_id: UUID | None = None
    slug: str | None = None
    version: int = 1


class RunStatePatch(BaseModel):
    phase: RunStatePhaseType | None = None
    wizard_step_index: int | None = None
    slug: str | None = None
    payload: dict | None = None


class RunStateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    scope_type: str
    scope_key: str
    user_id: UUID
    agent_id: UUID | None
    slug: str | None
    phase: str
    wizard_step_index: int | None
    payload: dict
    version: int
    created_at: datetime
    updated_at: datetime
