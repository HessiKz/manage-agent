"""Platform-wide key/value settings (runtime-configurable from the admin panel)."""

from __future__ import annotations

from sqlalchemy import String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.database.base import Base, TimestampMixin, UUIDPkMixin


class PlatformSetting(Base, UUIDPkMixin, TimestampMixin):
    """A single platform setting addressed by a unique string key.

    Values are stored as JSONB so a key can hold a scalar or a structured
    object (e.g. the LLM-provider selection plus its connection details).
    """

    __tablename__ = "platform_settings"

    key: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    value: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}", nullable=False)

    def __repr__(self) -> str:
        return f"<PlatformSetting {self.key}>"
