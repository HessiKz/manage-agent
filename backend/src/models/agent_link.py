"""Agent-to-agent links (tool delegation or supervisor graph)."""

from __future__ import annotations

import enum
from uuid import UUID

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database.base import Base, TimestampMixin, UUIDPkMixin

if False:  # TYPE_CHECKING
    from src.models.agent import Agent


class AgentLinkType(str, enum.Enum):
    TOOL = "tool"
    SUPERVISES = "supervises"


class AgentLink(Base, UUIDPkMixin, TimestampMixin):
    __tablename__ = "agent_links"
    __table_args__ = (
        UniqueConstraint("caller_agent_id", "callee_agent_id", "link_type", name="uq_agent_link"),
        CheckConstraint("caller_agent_id <> callee_agent_id", name="ck_agent_link_no_self"),
    )

    caller_agent_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("agents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    callee_agent_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("agents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    link_type: Mapped[AgentLinkType] = mapped_column(
        SAEnum(
            AgentLinkType,
            name="agent_link_type",
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
    )
    requires_user_permission: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    caller: Mapped["Agent"] = relationship(
        "Agent",
        foreign_keys=[caller_agent_id],
        back_populates="outgoing_links",
    )
    callee: Mapped["Agent"] = relationship(
        "Agent",
        foreign_keys=[callee_agent_id],
        back_populates="incoming_links",
    )
