"""Vector store — document chunks + similarity search."""

from __future__ import annotations

import hashlib
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.document_chunk import DocumentChunk
from src.services.embedding_service import EmbeddingService


class VectorStore:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def upsert(
        self,
        content: str,
        *,
        agent_id: UUID | None = None,
        source: str = "manual",
        meta: dict | None = None,
    ) -> DocumentChunk:
        content_hash = hashlib.sha256(content.encode()).hexdigest()
        existing = await self.db.execute(
            select(DocumentChunk).where(DocumentChunk.content_hash == content_hash)
        )
        if row := existing.scalar_one_or_none():
            return row

        vector = await EmbeddingService.embed_text(content)
        chunk = DocumentChunk(
            agent_id=agent_id,
            source=source,
            content=content,
            content_hash=content_hash,
            embedding=vector,
            meta=meta or {},
        )
        self.db.add(chunk)
        await self.db.flush()
        await self.db.refresh(chunk)
        return chunk

    async def search(
        self,
        query: str,
        *,
        agent_id: UUID | None = None,
        limit: int = 5,
    ) -> list[tuple[DocumentChunk, float]]:
        query_vec = await EmbeddingService.embed_text(query)
        stmt = select(DocumentChunk)
        if agent_id:
            stmt = stmt.where(DocumentChunk.agent_id == agent_id)
        result = await self.db.execute(stmt.limit(200))
        chunks = list(result.scalars().all())

        scored: list[tuple[DocumentChunk, float]] = []
        for c in chunks:
            if isinstance(c.embedding, list):
                score = EmbeddingService.cosine_similarity(query_vec, c.embedding)
                scored.append((c, score))
        scored.sort(key=lambda x: x[1], reverse=True)
        return scored[:limit]
