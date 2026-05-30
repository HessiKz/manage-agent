"""DashboardConfig ORM model — user-customizable dashboards."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from src.database.base import Base, TimestampMixin, UUIDPkMixin


class DashboardConfig(Base, UUIDPkMixin, TimestampMixin):
    """Per-user dashboard layout/widget configuration."""

    __tablename__ = "dashboard_configs"

    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), default="Default", nullable=False)
    layout: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}", nullable=False)
    widgets: Mapped[list] = mapped_column(JSONB, default=list, server_default="[]", nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
