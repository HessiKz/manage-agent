"""Service layer for async execution jobs.

Builds a job row from an invoke (sandbox enqueue) or a direct admin submit, and
exposes auth-scoped read/cancel/status updates. P0 path (pinned
run_agent_script) never calls enqueue_from_invoke — it stays native.

Quota enforcement is a TODO hook against PlatformSettingsService; guarded so a
not-yet-built method cannot crash enqueue.
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import UUID

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.agent_workspace_files import agent_workspace_root
from src.core.errors import AppError, ErrorCode
from src.models.agent import Agent
from src.models.execution_job import (
    ExecutionBackend,
    ExecutionJob,
    ExecutionJobArtifact,
    ExecutionJobStatus,
)
from src.models.user import User
from src.schemas.agent import AgentInvokeRequest
from src.schemas.execution_job import ArtifactRef, ExecutionJobCreate, ExecutionJobSpec


# Terminal states after which no further transition (other than cancel) is valid.
_FINISHED = frozenset(
    {
        ExecutionJobStatus.SUCCEEDED,
        ExecutionJobStatus.FAILED,
        ExecutionJobStatus.CANCELLED,
        ExecutionJobStatus.TIMED_OUT,
    }
)

# Allowed forward transitions per current status.
_TRANSITIONS: dict[ExecutionJobStatus, set[ExecutionJobStatus]] = {
    ExecutionJobStatus.QUEUED: {
        ExecutionJobStatus.RUNNING,
        ExecutionJobStatus.CANCELLED,
        ExecutionJobStatus.FAILED,
    },
    ExecutionJobStatus.RUNNING: {
        ExecutionJobStatus.EXTRACTING,
        ExecutionJobStatus.VALIDATING,
        ExecutionJobStatus.SUCCEEDED,
        ExecutionJobStatus.FAILED,
        ExecutionJobStatus.TIMED_OUT,
        ExecutionJobStatus.CANCELLED,
    },
    ExecutionJobStatus.EXTRACTING: {
        ExecutionJobStatus.VALIDATING,
        ExecutionJobStatus.SUCCEEDED,
        ExecutionJobStatus.FAILED,
        ExecutionJobStatus.CANCELLED,
    },
    ExecutionJobStatus.VALIDATING: {
        ExecutionJobStatus.SUCCEEDED,
        ExecutionJobStatus.FAILED,
        ExecutionJobStatus.CANCELLED,
    },
}


class ExecutionJobService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ── enqueue ────────────────────────────────────────────────────

    async def enqueue_from_invoke(
        self, agent: Agent, payload: AgentInvokeRequest, user: User
    ) -> ExecutionJob:
        """Build + insert a queued sandbox job from an autonomous worker invoke."""
        await self._enforce_quota(agent, user)

        runtime = (agent.config_json or {}).get("runtime", {})
        backend = (
            ExecutionBackend.DOCKER
            if runtime.get("execution_backend") == "sandbox"
            and settings.sandbox_execution_enabled
            else ExecutionBackend.NATIVE
        )
        spec = self._spec_from_agent(agent, payload.input, user, runtime, thread_id=payload.thread_id)
        job = self._row_from_spec(spec, runtime, backend=backend)
        self.db.add(job)
        await self.db.commit()
        await self.db.refresh(job)

        # Hand off to the docker backend, which pushes the job onto the Redis
        # queue consumed by scripts/sandbox_worker.py. Native jobs stay inline
        # (run by NativeBackend) and never touch the queue.
        if backend == ExecutionBackend.DOCKER:
            from src.execution.backends.docker_backend import DockerSandboxBackend

            await DockerSandboxBackend(self.db).submit(job.id, spec)
        return job

    async def create_direct(self, payload: ExecutionJobCreate, user: User) -> ExecutionJob:
        """Admin override / direct submit, bypassing invoke routing."""
        agent = await self.db.get(Agent, payload.agent_id)
        if agent is None:
            raise AppError("agent not found", code=ErrorCode.NOT_FOUND, status_code=404)

        spec = ExecutionJobSpec(
            tenant_id=None,
            user_id=user.id,
            agent_id=agent.id,
            workspace_root=agent_workspace_root(agent.id),
            precision=payload.precision,
            prompt=payload.prompt,
            thread_id=payload.thread_id,
            timeout_seconds=payload.timeout_seconds,
            memory_limit_mb=payload.memory_limit_mb,
            skill_id=payload.skill_id,
            parent_job_id=payload.parent_job_id,
            env_secrets=payload.env_secrets,
        )
        job = self._row_from_spec(
            spec, {"execution_backend": payload.backend.value}, backend=payload.backend
        )
        self.db.add(job)
        await self.db.commit()
        await self.db.refresh(job)
        return job

    # ── reads ──────────────────────────────────────────────────────

    async def get(self, job_id: UUID, user: User | None = None) -> ExecutionJob | None:
        stmt = (
            select(ExecutionJob)
            .where(ExecutionJob.id == job_id)
            .options()
        )
        job = (await self.db.execute(stmt)).scalar_one_or_none()
        if job is None:
            return None
        if user is not None:
            self._authorize(job, user)
        return job

    async def list_for_agent(
        self, agent_id: UUID, user: User, page: int = 1, page_size: int = 20
    ) -> tuple[list[ExecutionJob], int]:
        from sqlalchemy import func

        count = await self.db.scalar(
            select(func.count())
            .select_from(ExecutionJob)
            .where(ExecutionJob.agent_id == agent_id)
        )
        count = int(count or 0)
        stmt = (
            select(ExecutionJob)
            .where(ExecutionJob.agent_id == agent_id)
            .order_by(desc(ExecutionJob.created_at))
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        rows = (await self.db.execute(stmt)).scalars().all()
        return list(rows), count

    # ── mutations ──────────────────────────────────────────────────

    async def cancel(self, job_id: UUID, user: User) -> ExecutionJob:
        job = await self.get(job_id, user)
        if job is None:
            raise AppError("job not found", code=ErrorCode.NOT_FOUND, status_code=404)
        if job.status in _FINISHED:
            raise AppError(
                "job already finished", code=ErrorCode.CONFLICT, status_code=409
            )
        return await self.update_status(job_id, ExecutionJobStatus.CANCELLED)

    async def update_status(
        self, job_id: UUID, status: ExecutionJobStatus, **fields: Any
    ) -> ExecutionJob:
        job = await self.db.get(ExecutionJob, job_id)
        if job is None:
            raise AppError("job not found", code=ErrorCode.NOT_FOUND, status_code=404)

        if status not in _TRANSITIONS.get(job.status, set()) and status != job.status:
            raise AppError(
                f"invalid transition {job.status.value} -> {status.value}",
                code=ErrorCode.UNPROCESSABLE,
                status_code=422,
            )

        if status in (ExecutionJobStatus.RUNNING,) and job.started_at is None:
            fields.setdefault("started_at", _now())
        if status in _FINISHED and job.finished_at is None:
            fields.setdefault("finished_at", _now())

        job.status = status
        for key, value in fields.items():
            if hasattr(job, key):
                setattr(job, key, value)
        self.db.add(job)
        await self.db.commit()
        await self.db.refresh(job)
        return job

    async def attach_artifacts(self, job_id: UUID, refs: list[ArtifactRef]) -> list[ExecutionJobArtifact]:
        job = await self.db.get(ExecutionJob, job_id)
        if job is None:
            raise AppError("job not found", code=ErrorCode.NOT_FOUND, status_code=404)
        created: list[ExecutionJobArtifact] = []
        for ref in refs:
            art = ExecutionJobArtifact(
                job_id=job_id,
                relative_path=ref.relative_path,
                mime_type=ref.mime_type,
                size_bytes=ref.size_bytes,
                description=ref.description,
            )
            self.db.add(art)
            created.append(art)
        await self.db.commit()
        return created

    # ── helpers ────────────────────────────────────────────────────

    def _spec_from_agent(
        self,
        agent: Agent,
        prompt: str,
        user: User,
        runtime: dict[str, Any],
        thread_id: str | None = None,
    ) -> ExecutionJobSpec:
        cfg = agent.config_json or {}
        return ExecutionJobSpec(
            tenant_id=getattr(agent, "org_id", None),
            user_id=user.id,
            agent_id=agent.id,
            workspace_root=agent_workspace_root(agent.id),
            precision=str(cfg.get("execution_precision", "autonomous")),
            prompt=prompt,
            thread_id=thread_id,
            input_files=[],
            allowed_tools=list(agent.tool_names or []),
            timeout_seconds=int(runtime.get("timeout_seconds", 900)),
            memory_limit_mb=int(runtime.get("memory_limit_mb", 2048)),
            skill_id=None,
            parent_job_id=None,
            env_secrets={},
        )

    def _row_from_spec(
        self,
        spec: ExecutionJobSpec,
        runtime: dict[str, Any],
        backend: ExecutionBackend,
    ) -> ExecutionJob:
        return ExecutionJob(
            org_id=spec.tenant_id,
            user_id=spec.user_id,
            agent_id=spec.agent_id,
            thread_id=spec.thread_id,
            backend=backend,
            status=ExecutionJobStatus.QUEUED,
            precision=spec.precision,
            input={
                "prompt": spec.prompt,
                "allowed_tools": spec.allowed_tools,
                "input_files": [str(p) for p in spec.input_files],
                "env_secrets_keys": list(spec.env_secrets.keys()),  # never the values
            },
            timeout_seconds=spec.timeout_seconds,
            memory_limit_mb=spec.memory_limit_mb,
            skill_id=spec.skill_id,
            parent_job_id=spec.parent_job_id,
        )

    @staticmethod
    def _authorize(job: ExecutionJob, user: User) -> None:
        if user.is_superuser:
            return
        if job.user_id == user.id:
            return
        raise AppError(
            "not authorized to access this job",
            code=ErrorCode.PERMISSION_DENIED,
            status_code=403,
        )

    async def _enforce_quota(self, agent: Agent, user: User) -> None:
        """Enforce sandbox kill-switch + org concurrency/daily quotas (Phase 3 M5).

        Only applies to sandbox jobs; native jobs are exempt. Raises AppError
        (409) when the kill-switch is active or a quota is exceeded.
        """
        runtime = (agent.config_json or {}).get("runtime", {})
        if runtime.get("execution_backend") != "sandbox":
            return
        from src.services.sandbox_quota_service import SandboxQuotaService

        allowed, reason = await SandboxQuotaService(self.db).check_and_consume(
            getattr(agent, "org_id", None), {"backend": "sandbox"}
        )
        if not allowed:
            raise AppError(reason, code=ErrorCode.CONFLICT, status_code=409)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")
