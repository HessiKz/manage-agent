"""Native in-process execution backend.

Wraps the existing orchestrator ReAct path so a sandbox-job enqueue can run
inline for M1. Records status transitions queued -> running -> succeeded on the
row via ExecutionJobService. Kept minimal: no microVM, no real isolation yet.
"""

from __future__ import annotations

from uuid import UUID

from src.agents_lib.graph_agent import run_react_agent
from src.core.agent_workspace_files import agent_workspace_root
from src.models.agent import Agent
from src.models.agent_file import AgentFile
from src.models.execution_job import ExecutionBackend, ExecutionJobStatus
from src.models.user import User
from src.schemas.execution_job import ArtifactRef, ExecutionJobSpec
from src.services.agent_file_service import AgentFileService
from src.services.execution_job_service import ExecutionJobService
from src.services.orchestrator_service import OrchestratorService


class NativeBackend:
    """Runs a job synchronously/in-process (no sandbox isolation for M1)."""

    backend = ExecutionBackend.NATIVE

    def __init__(self, db) -> None:
        self.db = db
        self._jobs = ExecutionJobService(db)

    async def submit(self, job_id: UUID, spec: ExecutionJobSpec, user: User | None = None) -> None:
        """Run the job inline, recording status transitions as we go."""
        agent = await self.db.get(Agent, spec.agent_id)
        if agent is None:
            await self._jobs.update_status(
                job_id, ExecutionJobStatus.FAILED, error="agent not found"
            )
            return

        await self._jobs.update_status(job_id, ExecutionJobStatus.RUNNING)

        orch = OrchestratorService(self.db)
        try:
            enriched = await orch.build_enriched_input(agent, spec.prompt)
            run_result = await run_react_agent(
                agent, enriched, [], tool_names=list(spec.allowed_tools) or None
            )
            await self._jobs.update_status(
                job_id,
                ExecutionJobStatus.SUCCEEDED,
                output={"output": run_result.output},
            )
        except Exception as exc:  # noqa: BLE001 - record then surface as failed
            await self._jobs.update_status(
                job_id, ExecutionJobStatus.FAILED, error=str(exc)
            )

    async def poll(self, job_id: UUID) -> ExecutionJobStatus:
        job = await self._jobs.get(job_id)
        if job is None:
            return ExecutionJobStatus.FAILED
        return job.status

    async def cancel(self, job_id: UUID) -> None:
        await self._jobs.update_status(job_id, ExecutionJobStatus.CANCELLED)

    async def collect_artifacts(self, job_id: UUID) -> list[ArtifactRef]:
        """Gather the agent's workspace files as artifact refs.

        M1: returns refs for the agent's files; full sandbox file-capture lands
        with the Docker backend.
        """
        job = await self._jobs.get(job_id)
        if job is None:
            return []
        agent_workspace_root(job.agent_id)  # workspace root reserved for later
        svc = AgentFileService(self.db)
        files: list[AgentFile] = await svc.list_files(job.agent_id)
        return [
            ArtifactRef(
                job_id=job_id,
                relative_path=f.relative_path,
                mime_type=f.mime_type,
                size_bytes=f.size_bytes,
                description=f.description,
            )
            for f in files
        ]
