"""Vector store — document chunks + similarity search."""

from __future__ import annotations

import hashlib
import re
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.document_chunk import DocumentChunk
from src.services.embedding_service import EmbeddingService

CHUNK_TARGET_CHARS = 1200
CHUNK_OVERLAP_CHARS = 160


def normalize_document_text(content: str) -> str:
    lines = [re.sub(r"\s+", " ", line).strip() for line in content.splitlines()]
    compact = "\n".join(line for line in lines if line)
    compact = re.sub(r"\n{3,}", "\n\n", compact)
    return compact.strip()


def split_document_chunks(content: str, target: int = CHUNK_TARGET_CHARS) -> list[str]:
    clean = normalize_document_text(content)
    if len(clean) <= target:
        return [clean] if clean else []

    paragraphs = [p.strip() for p in re.split(r"\n{2,}", clean) if p.strip()]
    if len(paragraphs) <= 1:
        paragraphs = [p.strip() for p in re.split(r"(?<=[.!؟?])\s+", clean) if p.strip()]

    chunks: list[str] = []
    current = ""
    for part in paragraphs:
        if not current:
            current = part
            continue
        if len(current) + len(part) + 2 <= target:
            current = f"{current}\n\n{part}"
            continue
        chunks.append(current)
        overlap = current[-CHUNK_OVERLAP_CHARS:].strip()
        current = f"{overlap}\n\n{part}" if overlap else part

    if current:
        chunks.append(current)

    return chunks


class VectorStore:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def upsert(
        self,
        content: str,
        *,
        agent_id: UUID | None = None,
        dataset_id: UUID | None = None,
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
            dataset_id=dataset_id,
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

    async def upsert_document(
        self,
        content: str,
        *,
        agent_id: UUID | None = None,
        dataset_id: UUID | None = None,
        source: str = "manual",
        meta: dict | None = None,
    ) -> list[DocumentChunk]:
        parts = split_document_chunks(content)
        chunks: list[DocumentChunk] = []
        total = len(parts)
        for idx, part in enumerate(parts, start=1):
            chunk = await self.upsert(
                part,
                agent_id=agent_id,
                dataset_id=dataset_id,
                source=source,
                meta={**(meta or {}), "chunk_index": idx, "chunk_total": total},
            )
            chunks.append(chunk)
        return chunks

    async def search(
        self,
        query: str,
        *,
        agent_id: UUID | None = None,
        dataset_ids: list[UUID] | None = None,
        limit: int = 5,
    ) -> list[tuple[DocumentChunk, float]]:
        query_vec = await EmbeddingService.embed_text(query)
        stmt = select(DocumentChunk)
        filters = []
        if agent_id:
            filters.append(DocumentChunk.agent_id == agent_id)
        if dataset_ids:
            filters.append(DocumentChunk.dataset_id.in_(dataset_ids))
        if filters:
            stmt = stmt.where(or_(*filters) if len(filters) > 1 else filters[0])
        elif agent_id is None and not dataset_ids:
            stmt = stmt.where(DocumentChunk.agent_id.is_(None), DocumentChunk.dataset_id.is_(None))
        result = await self.db.execute(stmt.limit(400))
        chunks = list(result.scalars().all())

        scored: list[tuple[DocumentChunk, float]] = []
        for c in chunks:
            role = (c.meta or {}).get("role") if isinstance(c.meta, dict) else None
            if role == "instruction":
                continue
            if isinstance(c.embedding, list):
                score = EmbeddingService.cosine_similarity(query_vec, c.embedding)
                scored.append((c, score))
        scored.sort(key=lambda x: x[1], reverse=True)
        return scored[:limit]

    async def search_for_agent(
        self,
        query: str,
        *,
        agent_id: UUID,
        dataset_ids: list[UUID],
        limit: int = 5,
    ) -> list[tuple[DocumentChunk, float]]:
        return await self.search(
            query,
            agent_id=agent_id,
            dataset_ids=dataset_ids or None,
            limit=limit,
        )

    async def list_chunks(
        self,
        *,
        agent_id: UUID | None = None,
        dataset_id: UUID | None = None,
        limit: int = 50,
    ) -> list[DocumentChunk]:
        stmt = select(DocumentChunk).order_by(DocumentChunk.created_at.desc())
        if agent_id is not None:
            stmt = stmt.where(DocumentChunk.agent_id == agent_id)
        if dataset_id is not None:
            stmt = stmt.where(DocumentChunk.dataset_id == dataset_id)
        result = await self.db.execute(stmt.limit(limit))
        return list(result.scalars().all())
