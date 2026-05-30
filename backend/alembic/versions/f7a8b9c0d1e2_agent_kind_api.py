"""Add agent_kind value: api

Revision ID: f7a8b9c0d1e2
Revises: e5f6a7b8c9d0
"""

from typing import Sequence, Union

from alembic import op

revision: str = "f7a8b9c0d1e2"
down_revision: Union[str, None] = "e5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE agent_kind ADD VALUE IF NOT EXISTS 'api'")


def downgrade() -> None:
    pass
