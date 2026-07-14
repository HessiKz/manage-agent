"""Create platform_skills table (Phase 2 M1 — institutional memory).

Revision ID: q1a2b3c4d5e6
Revises: p7q8r9s0t1u2
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "q1a2b3c4d5e6"
down_revision: Union[str, None] = "p7q8r9s0t1u2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "platform_skills",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("slug", sa.String(length=120), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("name_fa", sa.String(length=255), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("scope", sa.String(length=32), nullable=False, server_default="platform"),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("agent_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("source", sa.String(length=16), nullable=False, server_default="manual"),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="draft"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("supersedes_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("trigger", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"),
        sa.Column(
            "procedure",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column("content_md", sa.Text(), nullable=True),
        sa.Column(
            "stats",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default='{"success_count": 0, "failure_count": 0, "last_used_at": null}',
        ),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
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
        sa.UniqueConstraint("slug", name="uq_platform_skills_slug"),
        sa.ForeignKeyConstraint(["agent_id"], ["agents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["supersedes_id"], ["platform_skills.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.CheckConstraint(
            "scope IN ('platform', 'org', 'agent')",
            name="ck_platform_skills_scope",
        ),
        sa.CheckConstraint(
            "source IN ('manual', 'learned', 'imported')",
            name="ck_platform_skills_source",
        ),
        sa.CheckConstraint(
            "status IN ('draft', 'active', 'archived')",
            name="ck_platform_skills_status",
        ),
        sa.CheckConstraint(
            "(scope = 'agent' AND agent_id IS NOT NULL) OR scope != 'agent'",
            name="ck_platform_skills_agent_scope_requires_agent_id",
        ),
    )
    op.create_index(
        "idx_platform_skills_status",
        "platform_skills",
        ["status"],
        postgresql_where=sa.text("status = 'active'"),
    )
    op.create_index("idx_platform_skills_scope", "platform_skills", ["scope", "agent_id"])


def downgrade() -> None:
    op.drop_index("idx_platform_skills_scope", table_name="platform_skills")
    op.drop_index("idx_platform_skills_status", table_name="platform_skills")
    op.drop_table("platform_skills")
