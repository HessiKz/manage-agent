"""agent files: upload attachments per agent

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
     op.create_table(
         "agent_files",
         sa.Column("agent_id", sa.UUID(), nullable=False),
         sa.Column("filename", sa.String(length=255), nullable=False),
         sa.Column("mime_type", sa.String(length=127), nullable=False, server_default="application/octet-stream"),
         sa.Column("size_bytes", sa.Integer(), nullable=False, server_default="0"),
         sa.Column("storage_path", sa.String(length=1024), nullable=False),
         sa.Column("id", sa.UUID(), nullable=False),
         sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
         sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
         sa.ForeignKeyConstraint(["agent_id"], ["agents.id"], ondelete="CASCADE"),
         sa.PrimaryKeyConstraint("id"),
     )
     op.create_index("ix_agent_files_agent_id", "agent_files", ["agent_id"])


def downgrade() -> None:
     op.drop_index("ix_agent_files_agent_id", table_name="agent_files")
     op.drop_table("agent_files")
