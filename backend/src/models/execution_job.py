"""Execution job records — async sandbox / native worker execution."""

from __future__ import annotations

import enum
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database.base import Base, TimestampMixin, UUIDPkMixin

if TYPE_CHECKING:
    from src.models.agent import Agent
    from src.models.agent_file import AgentFile
    from src.models.platform_skill import PlatformSkill
    from src.models.user import User


class ExecutionBackend(str, enum.Enum):
    NATIVE = "native"
    DOCKER = "docker"


class ExecutionJobStatus(str, enum.Enum):
    QUEUED = "queued"
    RUNNING = "running"
    EXTRACTING = "extracting"
    VALIDATING = "validating"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"
    TIMED_OUT = "timed_out"


class ExecutionJob(Base, UUIDPkMixin, TimestampMixin):
    """A single async execution of an agent (native in-process or docker sandbox)."""

    __tablename__ = "execution_jobs"
    __table_args__ = (
        CheckConstraint(
            "backend IN ('native', 'docker')", name="ck_execution_jobs_backend"
        ),
        CheckConstraint(
            "status IN ("
            "'queued', 'running', 'extracting', 'validating', "
            "'succeeded', 'failed', 'cancelled', 'timed_out'"
            ")",
            name="ck_execution_jobs_status",
        ),
    )

    org_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), nullable=True, index=True
    )
    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    agent_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("agents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    thread_id: Mapped[str | None] = mapped_column(String(512), nullable=True)
    parent_job_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("execution_jobs.id", ondelete="SET NULL"),
        nullable=True,
    )
    backend: Mapped[ExecutionBackend] = mapped_column(
        SAEnum(
            ExecutionBackend,
            name="execution_backend",
            values_callable=lambda x: [e.value for e in x],
        ),
        default=ExecutionBackend.NATIVE,
        nullable=False,
    )
    status: Mapped[ExecutionJobStatus] = mapped_column(
        SAEnum(
            ExecutionJobStatus,
            name="execution_job_status",
            values_callable=lambda x: [e.value for e in x],
        ),
        default=ExecutionJobStatus.QUEUED,
        nullable=False,
        index=True,
    )
    precision: Mapped[str] = mapped_column(String(32), nullable=False)
    input: Mapped[dict] = mapped_column(
        JSONB, default=dict, server_default="{}", nullable=False
    )
    output: Mapped[dict] = mapped_column(
        JSONB, default=dict, server_default="{}", nullable=False
    )
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    skill_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("platform_skills.id", ondelete="SET NULL"),
        nullable=True,
    )
    started_at: Mapped[str | None] = mapped_column(String(64), nullable=True)
    finished_at: Mapped[str | None] = mapped_column(String(64), nullable=True)
    timeout_seconds: Mapped[int] = mapped_column(
        Integer(), nullable=False, default=900
    )
    memory_limit_mb: Mapped[int] = mapped_column(
        Integer(), nullable=False, default=2048
    )
    stats: Mapped[dict] = mapped_column(
        JSONB, default=dict, server_default="{}", nullable=False
    )

    agent: Mapped["Agent"] = relationship("Agent")
    user: Mapped["User"] = relationship("User")
    parent_job: Mapped["ExecutionJob | None"] = relationship(
        "ExecutionJob", remote_side="ExecutionJob.id", foreign_keys=[parent_job_id]
    )
    skill: Mapped["PlatformSkill | None"] = relationship("PlatformSkill")
    artifacts: Mapped[list["ExecutionJobArtifact"]] = relationship(
        "ExecutionJobArtifact",
        back_populates="job",
        cascade="all, delete-orphan",
    )


class ExecutionJobArtifact(Base, UUIDPkMixin):
    """A file produced by an execution job, linked to an AgentFile."""

    __tablename__ = "execution_job_artifacts"

    job_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("execution_jobs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    agent_file_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("agent_files.id", ondelete="SET NULL"),
        nullable=True,
    )
    relative_path: Mapped[str] = mapped_column(String(512), nullable=False)
    mime_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    size_bytes: Mapped[int | None] = mapped_column(BigInteger(), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    job: Mapped["ExecutionJob"] = relationship(
        "ExecutionJob", back_populates="artifacts"
    )
    agent_file: Mapped["AgentFile | None"] = relationship("AgentFile")
