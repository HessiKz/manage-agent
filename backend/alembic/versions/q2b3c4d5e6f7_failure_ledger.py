"""Create failure_ledger table (Phase 2 M2 — institutional memory).

Revision ID: q2b3c4d5e6f7
Revises: q1a2b3c4d5e6
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "q2b3c4d5e6f7"
down_revision: Union[str, None] = "q1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "failure_ledger",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("pattern_hash", sa.String(length=64), nullable=False),
        sa.Column("scope", sa.String(length=32), nullable=False, server_default="platform"),
        sa.Column("phase", sa.String(length=32), nullable=True),
        sa.Column("pathname_prefix", sa.String(length=255), nullable=True),
        sa.Column("tool_name", sa.String(length=120), nullable=True),
        sa.Column("error_regex", sa.String(length=512), nullable=False),
        sa.Column("root_cause_tag", sa.String(length=64), nullable=False),
        sa.Column(
            "recommended_fix",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column("occurrence_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column(
            "last_seen_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("resolved_by_skill_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("sample_redacted", sa.Text(), nullable=True),
        sa.UniqueConstraint("pattern_hash", name="uq_failure_ledger_pattern_hash"),
        sa.ForeignKeyConstraint(
            ["resolved_by_skill_id"], ["platform_skills.id"], ondelete="SET NULL"
        ),
        sa.CheckConstraint(
            "root_cause_tag IN ("
            "'slug_hallucination', 'permissions_ui', 'blocker_misdetect', "
            "'wizard_step_rewind', 'agent_not_found', 'planning_stuck', "
            "'widget_disabled', 'network', 'unknown', "
            "'sandbox_oom', 'sandbox_timeout', 'sandbox_import_denied', "
            "'sandbox_empty_output', 'sandbox_partial'"
            ")",
            name="ck_failure_ledger_root_cause_tag",
        ),
    )
    op.create_index("idx_failure_ledger_tag", "failure_ledger", ["root_cause_tag"])
    op.create_index(
        "idx_failure_ledger_count",
        "failure_ledger",
        [sa.text("occurrence_count DESC")],
    )


def downgrade() -> None:
    op.drop_index("idx_failure_ledger_count", table_name="failure_ledger")
    op.drop_index("idx_failure_ledger_tag", table_name="failure_ledger")
    op.drop_table("failure_ledger")
