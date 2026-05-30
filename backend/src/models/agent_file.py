"""Uploaded files attached to agents (for RAG + downloads)."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from src.database.base import Base, TimestampMixin, UUIDPkMixin


class AgentFile(Base, UUIDPkMixin, TimestampMixin):
     __tablename__ = "agent_files"
 
     agent_id: Mapped[UUID] = mapped_column(
         PG_UUID(as_uuid=True),
         ForeignKey("agents.id", ondelete="CASCADE"),
         nullable=False,
         index=True,
     )
 
     filename: Mapped[str] = mapped_column(String(255), nullable=False)
     mime_type: Mapped[str] = mapped_column(String(127), nullable=False, default="application/octet-stream")
     size_bytes: Mapped[int] = mapped_column(nullable=False, default=0)
     storage_path: Mapped[str] = mapped_column(String(1024), nullable=False)
