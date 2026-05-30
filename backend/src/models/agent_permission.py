"""Per-agent user permissions."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from src.database.base import Base, TimestampMixin, UUIDPkMixin


class AgentUserPermission(Base, UUIDPkMixin, TimestampMixin):
    """Grant a user access to a specific agent."""

    __tablename__ = "agent_user_permissions"
    __table_args__ = (UniqueConstraint("user_id", "agent_id", name="uq_agent_user"),)

    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    agent_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("agents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    can_invoke: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    can_configure: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
