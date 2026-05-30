"""access requests

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
     op.create_table(
         "access_requests",
         sa.Column("user_id", sa.UUID(), nullable=False),
         sa.Column("agent_id", sa.UUID(), nullable=False),
         sa.Column(
             "status",
             sa.Enum("pending", "approved", "rejected", name="access_request_status"),
             nullable=False,
             server_default="pending",
         ),
         sa.Column("reason", sa.Text(), nullable=True),
         sa.Column("decision_note", sa.Text(), nullable=True),
         sa.Column("decided_by", sa.UUID(), nullable=True),
         sa.Column("id", sa.UUID(), nullable=False),
         sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
         sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
         sa.ForeignKeyConstraint(["agent_id"], ["agents.id"], ondelete="CASCADE"),
         sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
         sa.PrimaryKeyConstraint("id"),
     )
     op.create_index("ix_access_requests_user_id", "access_requests", ["user_id"])
     op.create_index("ix_access_requests_agent_id", "access_requests", ["agent_id"])
     op.create_index("ix_access_requests_status", "access_requests", ["status"])


def downgrade() -> None:
     op.drop_index("ix_access_requests_status", table_name="access_requests")
     op.drop_index("ix_access_requests_agent_id", table_name="access_requests")
     op.drop_index("ix_access_requests_user_id", table_name="access_requests")
     op.drop_table("access_requests")
     op.execute("DROP TYPE IF EXISTS access_request_status")
