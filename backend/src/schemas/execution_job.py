"""Schemas for the async execution-job layer (sandbox + native backends)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field, ConfigDict

from src.models.execution_job import ExecutionBackend, ExecutionJobStatus


@dataclass
class ExecutionJobSpec:
    """Runtime description handed to a backend at submit time.

    env_secrets are injected at runtime only and must never be logged.
    """

    tenant_id: UUID | None
    user_id: UUID
    agent_id: UUID
    workspace_root: Path
    precision: str
    prompt: str
    thread_id: str | None = None
    input_files: list[Path] = field(default_factory=list)
    allowed_tools: list[str] = field(default_factory=list)
    timeout_seconds: int = 900
    memory_limit_mb: int = 2048
    skill_id: UUID | None = None
    parent_job_id: UUID | None = None
    env_secrets: dict[str, str] = field(default_factory=dict)


class JobStatus(BaseModel):
    job_id: UUID
    status: ExecutionJobStatus
    backend: ExecutionBackend
    started_at: str | None = None
    finished_at: str | None = None
    error: str | None = None


@dataclass
class ArtifactRef:
    job_id: UUID
    relative_path: str
    mime_type: str | None
    size_bytes: int | None
    description: str | None = None


class ArtifactRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    job_id: UUID
    agent_file_id: UUID | None = None
    relative_path: str
    mime_type: str | None = None
    size_bytes: int | None = None
    description: str | None = None


class ExecutionJobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    org_id: UUID | None = None
    user_id: UUID
    agent_id: UUID
    thread_id: str | None = None
    parent_job_id: UUID | None = None
    backend: ExecutionBackend
    status: ExecutionJobStatus
    precision: str
    timeout_seconds: int
    memory_limit_mb: int
    skill_id: UUID | None = None
    input: dict[str, Any] = Field(default_factory=dict)
    output: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None
    started_at: str | None = None
    finished_at: str | None = None
    created_at: datetime
    artifacts: list[ArtifactRead] = Field(default_factory=list)


class ExecutionJobCreate(BaseModel):
    """Admin override / direct submit (bypasses invoke routing)."""

    agent_id: UUID
    thread_id: str | None = None
    precision: str = "autonomous"
    prompt: str = Field(default="", description="Optional starting prompt")
    backend: ExecutionBackend = ExecutionBackend.NATIVE
    timeout_seconds: int = 900
    memory_limit_mb: int = 2048
    skill_id: UUID | None = None
    parent_job_id: UUID | None = None
    env_secrets: dict[str, str] = Field(
        default_factory=dict, description="Injected at runtime, never logged"
    )
