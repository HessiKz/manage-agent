"""User ORM model."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, JSON, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database.base import Base, TimestampMixin, UUIDPkMixin

if TYPE_CHECKING:
    from src.models.agent import Agent
    from src.models.permission import Role


class User(Base, UUIDPkMixin, TimestampMixin):
    """A platform user (employee or admin)."""

    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    locale: Mapped[str] = mapped_column(String(10), default="fa", nullable=False)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_superuser: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    mfa_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    mfa_secret: Mapped[str | None] = mapped_column(String(255), nullable=True)

    department: Mapped[str | None] = mapped_column(String(100), nullable=True)
    title: Mapped[str | None] = mapped_column(String(100), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    address: Mapped[str | None] = mapped_column(String(512), nullable=True)

    # Durable per-user preferences (e.g. support autonomy level). Keep this a flat
    # bag of small values, not a nested document — the FE reads a handful of keys.
    preferences_json: Mapped[dict] = mapped_column(
        JSON, default=dict, server_default="{}", nullable=False
    )

    # Relationships
    roles: Mapped[list["Role"]] = relationship(
        "Role",
        secondary="user_roles",
        back_populates="users",
        lazy="selectin",
    )
    owned_agents: Mapped[list["Agent"]] = relationship(
        "Agent",
        back_populates="owner",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<User {self.email}>"

    # ── support autonomy preference (Phase 1 M3) ──────────────────
    @property
    def support_autonomy_level(self) -> int:
        raw = (self.preferences_json or {}).get("support_autonomy_level")
        if isinstance(raw, bool):
            return 1 if raw else 0
        if isinstance(raw, int) and 0 <= raw <= 3:
            return raw
        return 1

    def set_support_autonomy_level(self, level: int) -> None:
        if not isinstance(self.preferences_json, dict):
            self.preferences_json = {}
        self.preferences_json = {**self.preferences_json, "support_autonomy_level": int(level)}
