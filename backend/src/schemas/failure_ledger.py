"""Failure ledger Pydantic schemas."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from src.models.failure_ledger import FailureRootCauseTag


class FailureRecordRequest(BaseModel):
    """Inbound failure report (internal FE hook / wizard / sandbox)."""

    root_cause_tag: FailureRootCauseTag
    error_message: str = Field(..., min_length=1)
    scope: str = Field(default="platform", max_length=32)
    phase: str | None = Field(default=None, max_length=32)
    pathname_prefix: str | None = Field(default=None, max_length=255)
    tool_name: str | None = Field(default=None, max_length=120)
    sample_redacted: str | None = None


class FailureRead(BaseModel):
    """Mirrors the FailureLedger ORM row."""

    model_config = ConfigDict(from_attributes=True)

    pattern_hash: str
    scope: str
    phase: str | None
    pathname_prefix: str | None
    tool_name: str | None
    root_cause_tag: FailureRootCauseTag
    recommended_fix: dict
    occurrence_count: int
    last_seen_at: str
    resolved_by_skill_id: UUID | None
    sample_redacted: str | None


class FailureRelevantQuery(BaseModel):
    """Query for the /failures/relevant endpoint."""

    phase: str | None = None
    pathname: str | None = None
    error_substring: str | None = None
    top: int = Field(default=3, ge=1, le=50)


class RecommendedFix(BaseModel):
    """A recommended fix payload stored in FailureLedger.recommended_fix."""

    type: Literal["skill", "user_action", "tool"]
    message_fa: str | None = None
    skill_slug: str | None = None
    tool: str | None = None
