"""SSE endpoint streaming JobEvent progress for an execution job (M1, DB polling)."""

from __future__ import annotations

import asyncio
from typing import AsyncGenerator
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import StreamingResponse

from src.api.dependencies import CurrentUser, DB
from src.config import settings
from src.models.execution_job import ExecutionJobStatus
from src.services.execution_job_service import ExecutionJobService

router = APIRouter()

# Statuses after which no further transition is valid — close the stream.
_TERMINAL = frozenset(
    {
        ExecutionJobStatus.SUCCEEDED,
        ExecutionJobStatus.FAILED,
        ExecutionJobStatus.CANCELLED,
        ExecutionJobStatus.TIMED_OUT,
    }
)

# Map backend status → the high-level JobEvent type the frontend understands.
_TRANSITIONS_TO_EVENT = {
    ExecutionJobStatus.QUEUED: "queued",
    ExecutionJobStatus.RUNNING: "started",
    ExecutionJobStatus.EXTRACTING: "artifact",
    ExecutionJobStatus.VALIDATING: "validating",
}

_POLL_INTERVAL_SECONDS = 1.5


def _artifacts_to_dicts(job) -> list[dict]:
    out: list[dict] = []
    for art in job.artifacts or []:
        out.append(
            {
                "id": str(art.id),
                "relative_path": art.relative_path,
                "mime_type": art.mime_type,
                "size_bytes": art.size_bytes,
                "description": art.description,
            }
        )
    return out


def _event(payload: dict) -> str:
    return f"data: {payload.__str__()}\n\n"


async def _stream_job(job_id: UUID, user, db) -> AsyncGenerator[str, None]:
    """Poll the job row and emit JobEvent JSON until it reaches a terminal state.

    Honors auth scoping via ExecutionJobService.get (owner/superuser). On a
    status change we emit one event and remember the last-emitted status so we
    only push on actual transitions. Terminal states emit a final event and the
    generator returns, which closes the SSE response.
    """
    svc = ExecutionJobService(db)
    last_status: ExecutionJobStatus | None = None

    while True:
        job = await svc.get(job_id, user)
        if job is None:
            yield _event({"type": "error", "job_id": str(job_id), "message": "job not found"})
            return

        status_enum = job.status

        if status_enum != last_status:
            event_type = "done" if status_enum in _TERMINAL else _TRANSITIONS_TO_EVENT.get(
                status_enum, "progress"
            )

            if event_type == "done":
                if status_enum == ExecutionJobStatus.FAILED:
                    yield _event(
                        {
                            "type": "error",
                            "job_id": str(job_id),
                            "message": job.error or "job failed",
                        }
                    )
                else:
                    yield _event(
                        {
                            "type": "done",
                            "job_id": str(job_id),
                            "artifacts": _artifacts_to_dicts(job),
                        }
                    )
                return

            if event_type == "error" and job.error:
                yield _event(
                    {"type": "error", "job_id": str(job_id), "message": job.error}
                )
                return

            payload: dict = {"type": event_type, "job_id": str(job_id)}
            if event_type == "artifact" and job.artifacts:
                payload["artifact"] = _artifacts_to_dicts(job)[-1]
            if event_type == "started":
                pass
            else:
                payload["step"] = 0
                payload["total"] = 1
            yield _event(payload)
            last_status = status_enum

        if status_enum in _TERMINAL:
            return

        await asyncio.sleep(_POLL_INTERVAL_SECONDS)


@router.get("/jobs/{job_id}/events")
async def stream_job_events(job_id: UUID, request: Request, db: DB, user: CurrentUser):
    """Stream JobEvent progress for a job until it reaches a terminal state.

    Polls the execution_jobs row every ~1.5s (DB-backed, no pub/sub). The
    connection closes when the job finishes or the client disconnects.
    """
    job = await ExecutionJobService(db).get(job_id, user)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="job not found")

    async def _generator() -> AsyncGenerator[str, None]:
        try:
            async for chunk in _stream_job(job_id, user, db):
                if await request.is_disconnected():
                    return
                yield chunk
        except asyncio.CancelledError:
            return

    return StreamingResponse(
        _generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
