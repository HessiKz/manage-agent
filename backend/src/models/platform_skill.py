"""Reusable skill procedures — platform, org, or agent scoped."""

from __future__ import annotations

import enum
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import CheckConstraint, ForeignKey, Integer, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database.base import Base, TimestampMixin, UUIDPkMixin

if TYPE_CHECKING:
    from src.models.agent import Agent
    from src.models.user import User


class SkillScope(str, enum.Enum):
    PLATFORM = "platform"
    ORG = "org"
    AGENT = "agent"


class SkillSource(str, enum.Enum):
    MANUAL = "manual"
    LEARNED = "learned"
    IMPORTED = "imported"


class SkillStatus(str, enum.Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    ARCHIVED = "archived"


class PlatformSkill(Base, UUIDPkMixin, TimestampMixin):
    """A reusable procedure triggered by phase/pathname/intent/run-state."""

    __tablename__ = "platform_skills"
    __table_args__ = (
        CheckConstraint(
            "scope IN ('platform', 'org', 'agent')", name="ck_platform_skills_scope"
        ),
        CheckConstraint(
            "source IN ('manual', 'learned', 'imported')",
            name="ck_platform_skills_source",
        ),
        CheckConstraint(
            "status IN ('draft', 'active', 'archived')",
            name="ck_platform_skills_status",
        ),
        CheckConstraint(
            "(scope = 'agent' AND agent_id IS NOT NULL) OR scope != 'agent'",
            name="ck_platform_skills_agent_scope_requires_agent_id",
        ),
    )

    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    name_fa: Mapped[str | None] = mapped_column(String(255), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    scope: Mapped[SkillScope] = mapped_column(
        SAEnum(SkillScope, name="skill_scope", values_callable=lambda x: [e.value for e in x]),
        default=SkillScope.PLATFORM,
        nullable=False,
    )
    org_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    agent_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("agents.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    source: Mapped[SkillSource] = mapped_column(
        SAEnum(SkillSource, name="skill_source", values_callable=lambda x: [e.value for e in x]),
        default=SkillSource.MANUAL,
        nullable=False,
    )
    status: Mapped[SkillStatus] = mapped_column(
        SAEnum(SkillStatus, name="skill_status", values_callable=lambda x: [e.value for e in x]),
        default=SkillStatus.DRAFT,
        nullable=False,
        index=True,
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    supersedes_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("platform_skills.id", ondelete="SET NULL"),
        nullable=True,
    )
    trigger: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}", nullable=False)
    procedure: Mapped[dict] = mapped_column(
        JSONB, default=dict, server_default="{}", nullable=False
    )
    content_md: Mapped[str | None] = mapped_column(Text, nullable=True)
    stats: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        server_default='{"success_count": 0, "failure_count": 0, "last_used_at": null}',
        nullable=False,
    )
    created_by: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    agent: Mapped["Agent | None"] = relationship("Agent")
    superseded_by: Mapped["PlatformSkill | None"] = relationship(
        "PlatformSkill", remote_side="PlatformSkill.id", foreign_keys=[supersedes_id]
    )
