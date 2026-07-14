"""Redis queue consumer that runs sandbox jobs in isolated Docker containers.

Pops {job_id, spec} from ma:sandbox:queue, spawns a container binding the
agent workspace, decodes the runner result, records failures to the failure
ledger (sandbox_* tags), and registers artifacts as AgentFile rows.

Run with the backend venv:
    ./venv/bin/python scripts/sandbox_worker.py

The container image (manage-agent-sandbox:latest) is built from sandbox/Dockerfile.
"""

from __future__ import annotations

import asyncio
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

# Ensure backend is importable when run from the backend dir.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession  # noqa: E402

from src.config import settings  # noqa: E402
from src.database.session import async_session  # noqa: E402
from src.models.agent_file import AgentFile  # noqa: E402
from src.models.execution_job import ExecutionJob, ExecutionJobStatus  # noqa: E402
from src.models.failure_ledger import FailureRootCauseTag  # noqa: E402

QUEUE_NAME = "ma:sandbox:queue"
DEAD_LETTER = "ma:sandbox:dead_letter"
SANDBOX_IMAGE = os.environ.get("SANDBOX_IMAGE", "manage-agent-sandbox:latest")
AGENT_FILES_ROOT = Path(os.environ.get("AGENT_FILES_ROOT", "var/agent_files"))


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _record_failure(
    db: AsyncSession, tag: FailureRootCauseTag, message: str, phase: str = "sandbox"
) -> None:
    try:
        from src.services.failure_ledger_service import FailureLedgerService
        from src.schemas.failure_ledger import FailureRecordRequest

        req = FailureRecordRequest(
            root_cause_tag=tag.value,
            error_message=message,
            scope="platform",
            phase=phase,
        )
        await FailureLedgerService(db).record(req)
    except Exception:
        # Never let ledger recording crash the worker loop.
        pass


async def _update_job(
    db: AsyncSession, job_id: UUID, status: ExecutionJobStatus, **fields
) -> None:
    job = (
        await db.execute(select(ExecutionJob).where(ExecutionJob.id == job_id))
    ).scalar_one_or_none()
    if job is None:
        return
    job.status = status
    for k, v in fields.items():
        if k == "output":
            job.output = v
        elif k == "error":
            job.error = v
        elif k == "started_at":
            job.started_at = v
        elif k == "finished_at":
            job.finished_at = v
    await db.commit()


async def _make_agent_file(
    db: AsyncSession, agent_id: UUID, rel_path: str, mime: str | None, size: int | None
) -> AgentFile:
    af = AgentFile(
        agent_id=agent_id,
        filename=os.path.basename(rel_path),
        role="output",
        content_type=mime,
        size_bytes=size,
        source="sandbox",
    )
    db.add(af)
    await db.flush()
    return af


async def _process(db: AsyncSession, item: dict) -> None:
    job_id = UUID(item["job_id"])
    agent_id = UUID(item["agent_id"])
    workspace = Path(item["workspace_root"])
    timeout = int(item.get("timeout_seconds", 900))
    memory_mb = int(item.get("memory_limit_mb", 2048))

    await _update_job(db, job_id, ExecutionJobStatus.RUNNING, started_at=_now_iso())

    spec_path = workspace / "job_spec.json"
    spec_path.write_text(json.dumps(item), encoding="utf-8")
    host_mount = str(workspace.resolve())

    cmd = [
        "docker", "run", "--rm",
        "--network", "none",
        "--read-only",
        "--memory", f"{memory_mb}m",
        "--cpus", "1.0",
        "--pids-limit", "128",
        "--tmpfs", "/tmp:rw,size=64m",
        "-v", f"{host_mount}:/workspace:rw",
        "-v", f"{spec_path}:/job/spec.json:ro",
        SANDBOX_IMAGE,
    ]

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout_b, stderr_b = await asyncio.wait_for(
                proc.communicate(), timeout=timeout + 10
            )
        except asyncio.TimeoutError:
            proc.kill()
            await _record_failure(
                db, FailureRootCauseTag.SANDBOX_TIMEOUT,
                f"sandbox timed out after {timeout}s",
            )
            # One auto-retry with 1.5x timeout on timeout (not on OOM/import).
            await _maybe_retry(db, item, timeout=int(timeout * 1.5))
            await _update_job(
                db, job_id, ExecutionJobStatus.TIMED_OUT, finished_at=_now_iso(),
                error="timeout",
            )
            return
    except FileNotFoundError:
        # docker not installed in this environment.
        await _record_failure(
            db, FailureRootCauseTag.UNKNOWN, "docker runtime not available",
        )
        await _update_job(
            db, job_id, ExecutionJobStatus.FAILED, finished_at=_now_iso(),
            error="docker runtime unavailable",
        )
        return

    rc = proc.returncode
    stdout = stdout_b.decode("utf-8", "replace")
    result: dict = {}
    try:
        result = json.loads(stdout) if stdout.strip() else {}
    except json.JSONDecodeError:
        pass

    if rc == 137:
        await _record_failure(
            db, FailureRootCauseTag.SANDBOX_OOM, f"container OOM (rc=137)",
        )
        await _update_job(
            db, job_id, ExecutionJobStatus.FAILED, finished_at=_now_iso(),
            error="oom", output=result,
        )
        return
    if rc != 0 and result.get("status") != "succeeded":
        err = result.get("error", "nonzero exit")
        if "import denied" in str(err):
            tag = FailureRootCauseTag.SANDBOX_IMPORT_DENIED
        elif "no output" in str(err).lower():
            tag = FailureRootCauseTag.SANDBOX_EMPTY_OUTPUT
        else:
            tag = FailureRootCauseTag.SANDBOX_PARTIAL
        await _record_failure(db, tag, str(err))
        await _update_job(
            db, job_id, ExecutionJobStatus.FAILED, finished_at=_now_iso(),
            error=str(err), output=result,
        )
        return

    # Success: attach artifacts + register workspace outputs + AgentFile rows.
    artifacts = result.get("artifacts", [])
    from src.services.execution_job_service import ExecutionJobService
    from src.schemas.execution_job import ArtifactRef

    refs: list[ArtifactRef] = []
    for a in artifacts:
        rel = a.get("relative_path", "")
        # path traversal guard
        if os.path.isabs(rel) or rel.startswith(".."):
            continue
        af = await _make_agent_file(
            db, agent_id, rel, a.get("mime_type"), a.get("size_bytes")
        )
        try:
            from src.core.workspace_output_registry import register_workspace_output

            register_workspace_output(
                AGENT_FILES_ROOT, agent_id,
                (AGENT_FILES_ROOT / str(agent_id) / rel).resolve(),
            )
        except Exception:
            pass
        refs.append(ArtifactRef(
            job_id=job_id, relative_path=rel,
            mime_type=a.get("mime_type"), size_bytes=a.get("size_bytes"),
        ))
    await ExecutionJobService(db).attach_artifacts(job_id, refs)
    await _update_job(
        db, job_id, ExecutionJobStatus.SUCCEEDED, finished_at=_now_iso(),
        output=result,
    )


async def _maybe_retry(db: AsyncSession, item: dict, timeout: int) -> None:
    """One auto-retry on sandbox timeout with an increased timeout budget."""
    item = dict(item)
    item["timeout_seconds"] = int(timeout)
    try:
        await _process(db, item)
    except Exception:
        pass


async def main() -> int:
    if not settings.sandbox_worker_enabled:
        print("sandbox_worker_enabled is False; exiting.", flush=True)
        return 0

    import redis.asyncio as aioredis

    r = aioredis.from_url(settings.redis_url)
    print(f"sandbox worker waiting on {QUEUE_NAME}…", flush=True)
    while True:
        try:
            _, raw = await r.blpop(QUEUE_NAME, timeout=0)
            item = json.loads(raw)
            async with async_session() as db:
                try:
                    await _process(db, item)
                except Exception as e:
                    await r.rpush(DEAD_LETTER, json.dumps({"item": item, "error": str(e)}))
                    await db.rollback()
        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"worker loop error: {e}", file=sys.stderr, flush=True)
            await asyncio.sleep(1)
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
