"""Create execution_jobs + execution_job_artifacts tables (Phase 3 M1).

Revision ID: q3c4d5e6f7a8
Revises: q2b3c4d5e6f7
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "q3c4d5e6f7a8"
down_revision: Union[str, None] = "q2b3c4d5e6f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "execution_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("agent_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("thread_id", sa.String(length=512), nullable=True),
        sa.Column("parent_job_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("backend", sa.String(length=32), nullable=False, server_default="native"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="queued"),
        sa.Column("precision", sa.String(length=32), nullable=False),
        sa.Column(
            "input",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column(
            "output",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("skill_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("timeout_seconds", sa.Integer(), nullable=False, server_default="900"),
        sa.Column("memory_limit_mb", sa.Integer(), nullable=False, server_default="2048"),
        sa.Column(
            "stats",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["agent_id"], ["agents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["parent_job_id"], ["execution_jobs.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["skill_id"], ["platform_skills.id"], ondelete="SET NULL"),
        sa.CheckConstraint(
            "backend IN ('native', 'docker')",
            name="ck_execution_jobs_backend",
        ),
        sa.CheckConstraint(
            "status IN ("
            "'queued', 'running', 'extracting', 'validating', "
            "'succeeded', 'failed', 'cancelled', 'timed_out'"
            ")",
            name="ck_execution_jobs_status",
        ),
    )
    op.create_index(
        "idx_execution_jobs_agent",
        "execution_jobs",
        ["agent_id", sa.text("created_at DESC")],
    )
    op.create_index(
        "idx_execution_jobs_status",
        "execution_jobs",
        ["status"],
        postgresql_where=sa.text("status IN ('queued', 'running')"),
    )
    op.create_index("idx_execution_jobs_user", "execution_jobs", ["user_id"])

    op.create_table(
        "execution_job_artifacts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("job_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("agent_file_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("relative_path", sa.String(length=512), nullable=False),
        sa.Column("mime_type", sa.String(length=128), nullable=True),
        sa.Column("size_bytes", sa.BigInteger(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["job_id"], ["execution_jobs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["agent_file_id"], ["agent_files.id"], ondelete="SET NULL"),
    )
    op.create_index("idx_job_artifacts_job", "execution_job_artifacts", ["job_id"])


def downgrade() -> None:
    op.drop_index("idx_job_artifacts_job", table_name="execution_job_artifacts")
    op.drop_table("execution_job_artifacts")
    op.drop_index("idx_execution_jobs_user", table_name="execution_jobs")
    op.drop_index("idx_execution_jobs_status", table_name="execution_jobs")
    op.drop_index("idx_execution_jobs_agent", table_name="execution_jobs")
    op.drop_table("execution_jobs")
"""Create execution_jobs + execution_job_artifacts tables (Phase 3 M1).

Revision ID: q3c4d5e6f7a8
Revises: q2b3c4d5e6f7
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "q3c4d5e6f7a8"
down_revision: Union[str, None] = "q2b3c4d5e6f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "execution_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("agent_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("thread_id", sa.String(length=512), nullable=True),
        sa.Column("parent_job_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("backend", sa.String(length=32), nullable=False, server_default="native"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="queued"),
        sa.Column("precision", sa.String(length=32), nullable=False),
        sa.Column(
            "input",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column(
            "output",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("skill_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("timeout_seconds", sa.Integer(), nullable=False, server_default="900"),
        sa.Column("memory_limit_mb", sa.Integer(), nullable=False, server_default="2048"),
        sa.Column(
            "stats",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["agent_id"], ["agents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["parent_job_id"], ["execution_jobs.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["skill_id"], ["platform_skills.id"], ondelete="SET NULL"),
        sa.CheckConstraint(
            "backend IN ('native', 'docker')",
            name="ck_execution_jobs_backend",
        ),
        sa.CheckConstraint(
            "status IN ("
            "'queued', 'running', 'extracting', 'validating', "
            "'succeeded', 'failed', 'cancelled', 'timed_out'"
            ")",
            name="ck_execution_jobs_status",
        ),
    )
    op.create_index(
        "idx_execution_jobs_agent",
        "execution_jobs",
        ["agent_id", sa.text("created_at DESC")],
    )
    op.create_index(
        "idx_execution_jobs_status",
        "execution_jobs",
        ["status"],
        postgresql_where=sa.text("status IN ('queued', 'running')"),
    )
    op.create_index("idx_execution_jobs_user", "execution_jobs", ["user_id"])

    op.create_table(
        "execution_job_artifacts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("job_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("agent_file_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("relative_path", sa.String(length=512), nullable=False),
        sa.Column("mime_type", sa.String(length=128), nullable=True),
        sa.Column("size_bytes", sa.BigInteger(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["job_id"], ["execution_jobs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["agent_file_id"], ["agent_files.id"], ondelete="SET NULL"),
    )
    op.create_index("idx_job_artifacts_job", "execution_job_artifacts", ["job_id"])


def downgrade() -> None:
    op.drop_index("idx_job_artifacts_job", table_name="execution_job_artifacts")
    op.drop_table("execution_job_artifacts")
    op.drop_index("idx_execution_jobs_user", table_name="execution_jobs")
    op.drop_index("idx_execution_jobs_status", table_name="execution_jobs")
    op.drop_index("idx_execution_jobs_agent", table_name="execution_jobs")
    op.drop_table("execution_jobs")
