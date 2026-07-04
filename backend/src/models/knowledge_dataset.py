"""Organizational knowledge datasets — shared data collections for agents."""

from __future__ import annotations

from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database.base import Base, TimestampMixin, UUIDPkMixin


class KnowledgeDataset(Base, UUIDPkMixin, TimestampMixin):
    __tablename__ = "knowledge_datasets"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    department: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    source_type: Mapped[str] = mapped_column(String(16), nullable=False, default="text", server_default="text")
    example_input: Mapped[str | None] = mapped_column(Text, nullable=True)
    example_output: Mapped[str | None] = mapped_column(Text, nullable=True)

    chunks: Mapped[list["DocumentChunk"]] = relationship(
        "DocumentChunk",
        back_populates="dataset",
        cascade="all, delete-orphan",
    )
