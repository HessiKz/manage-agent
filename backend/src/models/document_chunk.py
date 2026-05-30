"""Vector document chunks for RAG."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from src.database.base import Base, TimestampMixin, UUIDPkMixin


class DocumentChunk(Base, UUIDPkMixin, TimestampMixin):
    __tablename__ = "document_chunks"

    agent_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("agents.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    source: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    # Stored as JSON array of floats for portability without pgvector extension
    embedding: Mapped[list] = mapped_column(JSONB, nullable=False)
    meta: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}", nullable=False)
