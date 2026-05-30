"""Knowledge base / vector ingest."""

from uuid import UUID

from fastapi import APIRouter, Query

from src.api.dependencies import DB, CurrentSuperuser
from src.schemas.external_api import KnowledgeIngestRequest
from src.services.vector_store import VectorStore

router = APIRouter()


@router.post("/ingest")
async def ingest(payload: KnowledgeIngestRequest, db: DB, _admin: CurrentSuperuser):
    chunk = await VectorStore(db).upsert(
        payload.content,
        agent_id=payload.agent_id,
        source=payload.source,
    )
    await db.commit()
    return {"id": str(chunk.id), "content_hash": chunk.content_hash}


@router.get("/search")
async def search(
    db: DB,
    _admin: CurrentSuperuser,
    q: str = Query(..., min_length=2),
    agent_id: UUID | None = None,
    limit: int = Query(5, ge=1, le=20),
):
    hits = await VectorStore(db).search(q, agent_id=agent_id, limit=limit)
    return [
        {"id": str(c.id), "content": c.content[:500], "score": round(score, 4), "source": c.source}
        for c, score in hits
    ]
