"""Knowledge base — datasets and vector ingest."""

import re
from uuid import UUID

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from sqlalchemy import func, select

from src.api.dependencies import DB, CurrentSuperuser
from src.models.document_chunk import DocumentChunk
from src.models.knowledge_dataset import KnowledgeDataset
from src.schemas.external_api import KnowledgeIngestRequest
from src.schemas.knowledge_dataset import (
    KnowledgeDatasetCreate,
    KnowledgeDatasetIngestRequest,
    KnowledgeDatasetRead,
    KnowledgeDatasetUpdate,
)
from src.services.agent_file_service import AgentFileService
from src.services.vector_store import VectorStore

router = APIRouter()


def _slugify(name: str) -> str:
    s = re.sub(r"[^\w\s-]", "", name.strip().lower())
    s = re.sub(r"[\s_-]+", "-", s).strip("-")
    return s[:100] or "dataset"


def _chunk_to_dict(c: DocumentChunk) -> dict:
    return {
        "id": str(c.id),
        "agent_id": str(c.agent_id) if c.agent_id else None,
        "dataset_id": str(c.dataset_id) if c.dataset_id else None,
        "content": c.content,
        "content_preview": c.content[:500],
        "source": c.source,
        "meta": c.meta,
        "created_at": c.created_at.isoformat(),
        "updated_at": c.updated_at.isoformat(),
    }


def _dataset_read(ds: KnowledgeDataset, chunk_count: int = 0) -> KnowledgeDatasetRead:
    return KnowledgeDatasetRead(
        id=ds.id,
        name=ds.name,
        slug=ds.slug,
        description=ds.description,
        department=ds.department,
        source_type=getattr(ds, "source_type", None) or "text",
        example_input=getattr(ds, "example_input", None),
        example_output=getattr(ds, "example_output", None),
        chunk_count=chunk_count,
        created_at=ds.created_at,
        updated_at=ds.updated_at,
    )


@router.get("/datasets", response_model=list[KnowledgeDatasetRead])
async def list_datasets(
    db: DB,
    _admin: CurrentSuperuser,
    q: str | None = None,
    source_type: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    count_sq = (
        select(DocumentChunk.dataset_id, func.count(DocumentChunk.id).label("cnt"))
        .where(DocumentChunk.dataset_id.isnot(None))
        .group_by(DocumentChunk.dataset_id)
        .subquery()
    )
    stmt = (
        select(KnowledgeDataset, func.coalesce(count_sq.c.cnt, 0))
        .outerjoin(count_sq, KnowledgeDataset.id == count_sq.c.dataset_id)
    )
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(
            KnowledgeDataset.name.ilike(like) | KnowledgeDataset.description.ilike(like)
        )
    if source_type:
        stmt = stmt.where(KnowledgeDataset.source_type == source_type)
    stmt = stmt.order_by(KnowledgeDataset.created_at.desc())
    offset = (page - 1) * page_size
    rows = await db.execute(stmt.offset(offset).limit(page_size))
    return [_dataset_read(ds, int(cnt or 0)) for ds, cnt in rows.all()]


@router.post("/datasets", response_model=KnowledgeDatasetRead)
async def create_dataset(payload: KnowledgeDatasetCreate, db: DB, _admin: CurrentSuperuser):
    slug = (payload.slug or _slugify(payload.name)).strip()
    existing = await db.execute(select(KnowledgeDataset).where(KnowledgeDataset.slug == slug))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Dataset slug already exists")
    ds = KnowledgeDataset(
        name=payload.name.strip(),
        slug=slug,
        description=payload.description,
        department=payload.department,
        source_type=payload.source_type,
        example_input=payload.example_input,
        example_output=payload.example_output,
    )
    db.add(ds)
    await db.commit()
    await db.refresh(ds)
    return _dataset_read(ds, 0)


@router.patch("/datasets/{dataset_id}", response_model=KnowledgeDatasetRead)
async def update_dataset(
    dataset_id: UUID,
    payload: KnowledgeDatasetUpdate,
    db: DB,
    _admin: CurrentSuperuser,
):
    ds = await db.get(KnowledgeDataset, dataset_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")
    data = payload.model_dump(exclude_unset=True)
    for key, val in data.items():
        setattr(ds, key, val)
    await db.commit()
    await db.refresh(ds)
    cnt = await db.scalar(
        select(func.count(DocumentChunk.id)).where(DocumentChunk.dataset_id == dataset_id)
    )
    return _dataset_read(ds, int(cnt or 0))


@router.delete("/datasets/{dataset_id}", status_code=204)
async def delete_dataset(dataset_id: UUID, db: DB, _admin: CurrentSuperuser):
    ds = await db.get(KnowledgeDataset, dataset_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")
    await db.delete(ds)
    await db.commit()


@router.post("/datasets/{dataset_id}/upload")
async def upload_dataset_file(
    dataset_id: UUID,
    db: DB,
    _admin: CurrentSuperuser,
    file: UploadFile = File(...),
):
    from src.core.file_text_extract import extract_text

    ds = await db.get(KnowledgeDataset, dataset_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")
    raw = await file.read()
    text = extract_text(raw, file.content_type, file.filename or "upload")
    if not text or len(text.strip()) < 10:
        raise HTTPException(status_code=422, detail="Could not extract enough text from file")
    ds.source_type = "file"
    chunks = await VectorStore(db).upsert_document(
        text,
        dataset_id=dataset_id,
        source=f"file:{file.filename}",
    )
    await db.commit()
    return {"dataset_id": str(dataset_id), "chunk_count": len(chunks)}


@router.post("/datasets/{dataset_id}/ingest")
async def ingest_dataset(
    dataset_id: UUID,
    payload: KnowledgeDatasetIngestRequest,
    db: DB,
    _admin: CurrentSuperuser,
):
    ds = await db.get(KnowledgeDataset, dataset_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")
    chunks = await VectorStore(db).upsert_document(
        payload.content,
        dataset_id=dataset_id,
        source=payload.source or f"dataset:{ds.slug}",
    )
    await db.commit()
    first = chunks[0] if chunks else None
    return {
        "dataset_id": str(dataset_id),
        "chunk_count": len(chunks),
        "content_hash": first.content_hash if first else "",
    }


@router.get("")
async def list_knowledge(
    db: DB,
    _admin: CurrentSuperuser,
    agent_id: UUID | None = None,
    dataset_id: UUID | None = None,
    limit: int = Query(200, ge=1, le=500),
):
    chunks = await VectorStore(db).list_chunks(
        agent_id=agent_id,
        dataset_id=dataset_id,
        limit=limit,
    )
    return [_chunk_to_dict(c) for c in chunks]


@router.post("/ingest")
async def ingest(payload: KnowledgeIngestRequest, db: DB, _admin: CurrentSuperuser):
    chunks = await VectorStore(db).upsert_document(
        payload.content,
        agent_id=payload.agent_id,
        dataset_id=payload.dataset_id,
        source=payload.source,
    )
    await db.commit()
    first = chunks[0] if chunks else None
    return {
        "id": str(first.id) if first else "",
        "ids": [str(c.id) for c in chunks],
        "chunk_count": len(chunks),
        "content_hash": first.content_hash if first else "",
    }


@router.post("/reindex-agent/{agent_id}")
async def reindex_agent_knowledge(agent_id: UUID, db: DB, _admin: CurrentSuperuser):
    indexed = await AgentFileService(db).reindex_files(agent_id)
    await db.commit()
    return {"agent_id": str(agent_id), "indexed_chunks": indexed}


@router.get("/search")
async def search(
    db: DB,
    _admin: CurrentSuperuser,
    q: str = Query(..., min_length=2),
    agent_id: UUID | None = None,
    dataset_id: UUID | None = None,
    limit: int = Query(5, ge=1, le=20),
):
    dataset_ids = [dataset_id] if dataset_id else None
    hits = await VectorStore(db).search(
        q,
        agent_id=agent_id,
        dataset_ids=dataset_ids,
        limit=limit,
    )
    return [
        {"id": str(c.id), "content": c.content[:500], "score": round(score, 4), "source": c.source}
        for c, score in hits
    ]
