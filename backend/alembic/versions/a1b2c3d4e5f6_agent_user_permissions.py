"""agent user permissions

Revision ID: a1b2c3d4e5f6
Revises: 9beb066129e4
Create Date: 2026-05-18 12:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "9beb066129e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "agent_user_permissions",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("agent_id", sa.UUID(), nullable=False),
        sa.Column("can_invoke", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("can_configure", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["agent_id"], ["agents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "agent_id", name="uq_agent_user"),
    )
    op.create_index("ix_agent_user_permissions_user_id", "agent_user_permissions", ["user_id"])
    op.create_index("ix_agent_user_permissions_agent_id", "agent_user_permissions", ["agent_id"])


def downgrade() -> None:
    op.drop_table("agent_user_permissions")
