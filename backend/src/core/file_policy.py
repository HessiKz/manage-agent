"""Server-side file policy validation."""

from __future__ import annotations

from pathlib import Path
from typing import Literal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.agent_training_context import (
    TRAINING_ATTACHMENT_POLICY,
    agent_in_interactive_training,
)
from src.models.agent import Agent
from src.models.agent_file import AgentFile
from src.schemas.agent_capabilities import AgentFilePolicy


def _normalize_policy(raw: dict | None) -> AgentFilePolicy:
    if not raw:
        return AgentFilePolicy()
    return AgentFilePolicy.model_validate(raw)


FileRole = Literal["input", "output"]


def _classify_role(filename: str) -> FileRole:
    from src.core.agent_file_roles import is_output_sample_file
    return "output" if is_output_sample_file(filename) else "input"


def resolve_io_policies(agent: Agent) -> tuple[AgentFilePolicy, AgentFilePolicy]:
    """Return (input_policy, output_policy) for an agent.

    New shape: file_policy = {"input": {...}, "output": {...}}.
    Legacy flat shape: interpreted as the input policy; output falls back
    to the default AgentFilePolicy (backward-compat for pre-split agents).
    """
    raw = agent.file_policy or {}
    if isinstance(raw, dict):
        if isinstance(raw.get("input"), dict) or isinstance(raw.get("output"), dict):
            inp = _normalize_policy(raw.get("input"))
            out = _normalize_policy(raw.get("output")) if isinstance(raw.get("output"), dict) else AgentFilePolicy()
            return inp, out
        if raw:
            return _normalize_policy(raw), AgentFilePolicy()
    return AgentFilePolicy(), AgentFilePolicy()


def _policy_for_upload(agent: Agent, filename: str) -> AgentFilePolicy:
    caps = agent.capabilities or {}
    if agent_in_interactive_training(agent) and not caps.get("file_upload_enabled", False):
        return TRAINING_ATTACHMENT_POLICY
    return resolve_io_policies(agent)[0 if _classify_role(filename) == "input" else 1]


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
    in_training = agent_in_interactive_training(agent)
    if not caps.get("file_upload_enabled", False) and not in_training:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="File upload is disabled for this agent",
        )

    policy = _policy_for_upload(agent, filename)
    ext = _extension(filename)
    if not policy.allow_all_types:
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
