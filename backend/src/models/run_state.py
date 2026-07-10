"""Authoritative run state for wizard/support/invoke flows.

Replaces scattered sessionStorage slug writes and LLM-prose phase guesses
with a single DB-backed source of truth scoped by (scope_type, scope_key).
"""

from __future__ import annotations

import enum
from uuid import UUID

from sqlalchemy import CheckConstraint, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database.base import Base, TimestampMixin, UUIDPkMixin


class RunStateScope(str, enum.Enum):
    WIZARD = "wizard"
    SUPPORT = "support"
    INVOKE = "invoke"


class RunStatePhase(str, enum.Enum):
    UNKNOWN = "unknown"
    WIZARD_FORM = "wizard_form"
    WIZARD_STEPS = "wizard_steps"
    PUBLISH = "publish"
    PLANNING = "planning"
    TRAINING = "training"
    DASHBOARD = "dashboard"
    VALIDATION = "validation"
    COMPLETE = "complete"
    ERROR = "error"


class RunState(Base, UUIDPkMixin, TimestampMixin):
    __tablename__ = "run_state"
    __table_args__ = (
        UniqueConstraint("scope_type", "scope_key", name="uq_run_state_scope"),
        CheckConstraint(
            "scope_type IN ('wizard','support','invoke')",
            name="ck_run_state_scope_type",
        ),
    )

    scope_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    scope_key: Mapped[str] = mapped_column(String(512), nullable=False)
    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    agent_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), nullable=True, index=True
    )
    slug: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    phase: Mapped[str] = mapped_column(String(32), nullable=False, default=RunStatePhase.UNKNOWN.value)
    wizard_step_index: Mapped[int | None] = mapped_column(nullable=True)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    version: Mapped[int] = mapped_column(nullable=False, default=1)

    user: Mapped["User"] = relationship("User")  # noqa: F821
