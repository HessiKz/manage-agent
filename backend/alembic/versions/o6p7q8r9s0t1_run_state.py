"""Create run_state table.

Revision ID: o6p7q8r9s0t1
Revises: n5o6p7q8r9s0
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "o6p7q8r9s0t1"
down_revision: Union[str, None] = "n5o6p7q8r9s0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "run_state",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("scope_type", sa.String(length=32), nullable=False),
        sa.Column("scope_key", sa.String(length=512), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("agent_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("slug", sa.String(length=255), nullable=True),
        sa.Column("phase", sa.String(length=32), nullable=False, server_default="unknown"),
        sa.Column("wizard_step_index", sa.Integer(), nullable=True),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["agent_id"], ["agents.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("scope_type", "scope_key", name="uq_run_state_scope"),
        sa.CheckConstraint(
            "scope_type IN ('wizard','support','invoke')", name="ck_run_state_scope_type"
        ),
    )
    op.create_index("idx_run_state_user", "run_state", ["user_id"])
    op.create_index(
        "idx_run_state_slug", "run_state", ["slug"], postgresql_where=sa.text("slug IS NOT NULL")
    )


def downgrade() -> None:
    op.drop_index("idx_run_state_slug", table_name="run_state")
    op.drop_index("idx_run_state_user", table_name="run_state")
    op.drop_table("run_state")
