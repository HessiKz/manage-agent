"""Failure ledger — recurring support/wizard/invoke/sandbox failures with root-cause tags."""

from __future__ import annotations

import enum
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import BigInteger, CheckConstraint, ForeignKey, Integer, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database.base import Base, UUIDPkMixin

if TYPE_CHECKING:
    from src.models.platform_skill import PlatformSkill


class FailureRootCauseTag(str, enum.Enum):
    """v1 root-cause taxonomy. Sandbox tags added in Phase 3."""

    SLUG_HALLUCINATION = "slug_hallucination"
    PERMISSIONS_UI = "permissions_ui"
    BLOCKER_MISDETECT = "blocker_misdetect"
    WIZARD_STEP_REWIND = "wizard_step_rewind"
    AGENT_NOT_FOUND = "agent_not_found"
    PLANNING_STUCK = "planning_stuck"
    WIDGET_DISABLED = "widget_disabled"
    NETWORK = "network"
    SANDBOX_OOM = "sandbox_oom"
    SANDBOX_TIMEOUT = "sandbox_timeout"
    SANDBOX_IMPORT_DENIED = "sandbox_import_denied"
    SANDBOX_EMPTY_OUTPUT = "sandbox_empty_output"
    SANDBOX_PARTIAL = "sandbox_partial"
    UNKNOWN = "unknown"


class FailureLedger(Base, UUIDPkMixin):
    """Deduplicated recurring failure patterns (one row per pattern_hash)."""

    __tablename__ = "failure_ledger"

    pattern_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    scope: Mapped[str] = mapped_column(String(32), nullable=False, default="platform")
    phase: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    pathname_prefix: Mapped[str | None] = mapped_column(String(255), nullable=True)
    tool_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    error_regex: Mapped[str] = mapped_column(String(512), nullable=False)
    root_cause_tag: Mapped[FailureRootCauseTag] = mapped_column(
        SAEnum(
            FailureRootCauseTag,
            name="failure_root_cause_tag",
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
        index=True,
    )
    recommended_fix: Mapped[dict] = mapped_column(
        JSONB, default=dict, server_default="{}", nullable=False
    )
    occurrence_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    last_seen_at: Mapped[str] = mapped_column(
        String(64), nullable=False, default=""
    )  # ISO timestamp set by service
    resolved_by_skill_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("platform_skills.id", ondelete="SET NULL"),
        nullable=True,
    )
    sample_redacted: Mapped[str | None] = mapped_column(Text, nullable=True)

    resolved_by_skill: Mapped["PlatformSkill | None"] = relationship("PlatformSkill")
