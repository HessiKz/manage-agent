"""Admin-defined structured actions for worker agents."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import ARRAY, Boolean, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database.base import Base, TimestampMixin, UUIDPkMixin

if False:  # TYPE_CHECKING
    from src.models.agent import Agent


class AgentAction(Base, UUIDPkMixin, TimestampMixin):
    __tablename__ = "agent_actions"
    __table_args__ = (UniqueConstraint("agent_id", "slug", name="uq_agent_action_slug"),)

    agent_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("agents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    slug: Mapped[str] = mapped_column(String(100), nullable=False)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    icon: Mapped[str | None] = mapped_column(String(50), nullable=True)
    input_schema: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}", nullable=False)
    prompt_template: Mapped[str] = mapped_column(Text, nullable=False)
    tool_chain: Mapped[list[str]] = mapped_column(
        ARRAY(String),
        default=list,
        server_default="{}",
        nullable=False,
    )
    confirmation_required: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    agent: Mapped["Agent"] = relationship("Agent", back_populates="actions")
