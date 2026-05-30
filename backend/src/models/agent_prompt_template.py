"""Admin-defined prompt templates for worker/chat agents."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database.base import Base, TimestampMixin, UUIDPkMixin

if False:  # TYPE_CHECKING
    from src.models.agent import Agent


class AgentPromptTemplate(Base, UUIDPkMixin, TimestampMixin):
    __tablename__ = "agent_prompt_templates"
    __table_args__ = (UniqueConstraint("agent_id", "slug", name="uq_agent_template_slug"),)

    agent_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("agents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    slug: Mapped[str] = mapped_column(String(100), nullable=False)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    variables: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}", nullable=False)
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    agent: Mapped["Agent"] = relationship("Agent", back_populates="templates")
