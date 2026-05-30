"""Server-side file policy validation."""

from __future__ import annotations

from pathlib import Path
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.agent import Agent
from src.models.agent_file import AgentFile
from src.schemas.agent_capabilities import AgentFilePolicy


def _normalize_policy(raw: dict | None) -> AgentFilePolicy:
    if not raw:
        return AgentFilePolicy()
    return AgentFilePolicy.model_validate(raw)


def _extension(filename: str) -> str:
    return Path(filename).suffix.lower()


async def count_agent_files(db: AsyncSession, agent_id: UUID) -> tuple[int, int]:
    result = await db.execute(
        select(func.count(AgentFile.id), func.coalesce(func.sum(AgentFile.size_bytes), 0)).where(
            AgentFile.agent_id == agent_id
        )
    )
    row = result.one()
    return int(row[0] or 0), int(row[1] or 0)


async def validate_upload(
    db: AsyncSession,
    agent: Agent,
    *,
    filename: str,
    mime_type: str,
    size_bytes: int,
) -> None:
    caps = agent.capabilities or {}
    if not caps.get("file_upload_enabled", False):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="File upload is disabled for this agent",
        )

    policy = _normalize_policy(agent.file_policy)
    ext = _extension(filename)
    mime_ok = mime_type in policy.allowed_mime_types
    ext_ok = ext in policy.allowed_extensions
    if not mime_ok and not ext_ok:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"File type not allowed: {mime_type} / {ext}",
        )

    max_bytes = policy.max_file_size_mb * 1024 * 1024
    if size_bytes > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"File exceeds max size of {policy.max_file_size_mb}MB",
        )

    count, total_bytes = await count_agent_files(db, agent.id)
    if count >= policy.max_files:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Maximum file count ({policy.max_files}) reached",
        )

    max_total = policy.max_total_size_mb * 1024 * 1024
    if total_bytes + size_bytes > max_total:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Total storage would exceed {policy.max_total_size_mb}MB",
        )


async def files_count_for_invoke(db: AsyncSession, agent_id: UUID) -> int:
    count, _ = await count_agent_files(db, agent_id)
    return count
