"""Execution-job REST endpoints (sandbox enqueue + history + control)."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status

from src.api.dependencies import CurrentSuperuser, CurrentUser, DB
from src.core.errors import AppError
from src.models.agent import Agent
from src.schemas.agent import AgentInvokeRequest
from src.schemas.common import Page
from src.schemas.execution_job import ExecutionJobCreate, ExecutionJobRead
from src.services.agent_service import AgentService
from src.services.execution_job_service import ExecutionJobService

router = APIRouter()


async def _load_agent(db, agent_id: UUID, user) -> Agent:
    agent = await AgentService(db).get(agent_id)
    if agent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="agent not found")
    return agent


@router.post("/agents/{agent_id}/jobs", response_model=dict, status_code=status.HTTP_201_CREATED)
async def submit_job(agent_id: UUID, payload: AgentInvokeRequest, db: DB, user: CurrentUser):
    """Submit a sandbox job as an alternative to a blocking invoke."""
    agent = await _load_agent(db, agent_id, user)
    job = await ExecutionJobService(db).enqueue_from_invoke(agent, payload, user)
    return {"job_id": str(job.id)}


@router.get("/agents/{agent_id}/jobs", response_model=Page[ExecutionJobRead])
async def list_jobs(
    agent_id: UUID,
    db: DB,
    user: CurrentUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
):
    await _load_agent(db, agent_id, user)
    rows, total = await ExecutionJobService(db).list_for_agent(agent_id, user, page, page_size)
    return Page[ExecutionJobRead](
        items=[ExecutionJobRead.model_validate(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/jobs/{job_id}", response_model=ExecutionJobRead)
async def get_job(job_id: UUID, db: DB, user: CurrentUser):
    job = await ExecutionJobService(db).get(job_id, user)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="job not found")
    return ExecutionJobRead.model_validate(job)


@router.post("/jobs/{job_id}/cancel", response_model=ExecutionJobRead)
async def cancel_job(job_id: UUID, db: DB, user: CurrentUser):
    try:
        job = await ExecutionJobService(db).cancel(job_id, user)
    except AppError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return ExecutionJobRead.model_validate(job)


@router.post("/jobs", response_model=ExecutionJobRead, status_code=status.HTTP_201_CREATED)
async def create_job_direct(payload: ExecutionJobCreate, db: DB, user: CurrentSuperuser):
    """Admin override / direct submit (bypasses invoke routing)."""
    job = await ExecutionJobService(db).create_direct(payload, user)
    return ExecutionJobRead.model_validate(job)
