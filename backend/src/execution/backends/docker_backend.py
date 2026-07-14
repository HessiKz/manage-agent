"""Docker sandbox execution backend.

Submits jobs onto a Redis queue consumed by scripts/sandbox_worker.py, which
spawns an isolated container per job. Network egress is denied; the workspace
is bind-mounted read-write; outputs are scanned for path traversal before
being registered as artifacts.
"""

from __future__ import annotations

import json
import os
import shutil
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.models.execution_job import ExecutionJob, ExecutionJobStatus
from src.schemas.execution_job import ArtifactRef, ExecutionJobSpec

QUEUE_NAME = "ma:sandbox:queue"


class DockerSandboxBackend:
    """Implements the ExecutionBackend Protocol for the docker sandbox."""

    def __init__(self, db: AsyncSession, redis_client=None) -> None:
        self.db = db
        self._redis = redis_client

    async def _redis_lazy(self):
        if self._redis is None:
            import redis.asyncio as aioredis  # local import; heavy dep

            self._redis = aioredis.from_url(settings.redis_url)
        return self._redis

    async def submit(self, job_id: UUID, spec: ExecutionJobSpec) -> None:
        if not settings.sandbox_execution_enabled:
            raise RuntimeError("sandbox_execution_enabled is False")
        # Validate the bind-mount path matches the job's agent to prevent
        # another tenant's workspace being mounted by a forged job_id.
        agent_root = str(spec.workspace_root)
        if str(spec.agent_id) not in agent_root:
            raise PermissionError("workspace_root does not match agent_id")
        payload = json.dumps(
            {
                "job_id": str(job_id),
                "agent_id": str(spec.agent_id),
                "user_id": str(spec.user_id),
                "workspace_root": agent_root,
                "precision": spec.precision,
                "prompt": spec.prompt,
                "thread_id": spec.thread_id,
                "timeout_seconds": spec.timeout_seconds,
                "memory_limit_mb": spec.memory_limit_mb,
                "skill_id": str(spec.skill_id) if spec.skill_id else None,
            }
        )
        r = await self._redis_lazy()
        await r.rpush(QUEUE_NAME, payload)

    async def poll(self, job_id: UUID) -> ExecutionJobStatus:
        from src.services.execution_job_service import ExecutionJobService

        job = await ExecutionJobService(self.db).get(job_id)
        if job is None:
            return ExecutionJobStatus.FAILED
        return ExecutionJobStatus(job.status)

    async def cancel(self, job_id: UUID) -> None:
        # The worker best-effort stops the container on cancel; here we just
        # record the intent (the service marks the row cancelled).
        from src.services.execution_job_service import ExecutionJobService

        await ExecutionJobService(self.db).update_status(
            job_id, ExecutionJobStatus.CANCELLED
        )

    async def collect_artifacts(self, job_id: UUID) -> list[ArtifactRef]:
        from sqlalchemy import select

        from src.models.execution_job import ExecutionJobArtifact

        rows = (
            (await self.db.execute(
                select(ExecutionJobArtifact).where(
                    ExecutionJobArtifact.job_id == job_id
                )
            )).scalars().all()
        )
        refs: list[ArtifactRef] = []
        for r in rows:
            # Path-traversal scan on the stored relative_path.
            rp = os.path.normpath(r.relative_path)
            if rp.startswith("..") or os.path.isabs(rp):
                continue
            refs.append(
                ArtifactRef(
                    job_id=job_id,
                    relative_path=rp,
                    mime_type=r.mime_type,
                    size_bytes=r.size_bytes,
                    description=r.description,
                )
            )
        return refs
