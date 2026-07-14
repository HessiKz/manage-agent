"""Backend protocol for async execution jobs.

A backend knows how to submit, poll, cancel, and collect artifacts for a job.
Native runs in-process; a future Docker backend would spawn a sandbox microVM.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable
from uuid import UUID

from src.models.execution_job import ExecutionJobStatus
from src.schemas.execution_job import ArtifactRef, ExecutionJobSpec


@runtime_checkable
class ExecutionBackend(Protocol):
    async def submit(self, job_id: UUID, spec: ExecutionJobSpec) -> None:
        """Start running the job. Must transition the row to at least RUNNING."""
        ...

    async def poll(self, job_id: UUID) -> ExecutionJobStatus:
        """Return the current status of the job."""
        ...

    async def cancel(self, job_id: UUID) -> None:
        """Request cancellation of a running/queued job."""
        ...

    async def collect_artifacts(self, job_id: UUID) -> list[ArtifactRef]:
        """Return artifact references produced by the job."""
        ...
