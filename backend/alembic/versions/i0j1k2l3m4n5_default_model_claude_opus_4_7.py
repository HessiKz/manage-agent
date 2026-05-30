"""Set default LLM model to claude-opus-4-7 for all agents.

Revision ID: i0j1k2l3m4n5
Revises: h9i0j1k2l3m4
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "i0j1k2l3m4n5"
down_revision: Union[str, None] = "h9i0j1k2l3m4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NEW_MODEL = "claude-opus-4-7"


def upgrade() -> None:
    op.execute(sa.text(f"UPDATE agents SET model_name = '{NEW_MODEL}'"))
    op.alter_column(
        "agents",
        "model_name",
        server_default=NEW_MODEL,
        existing_type=sa.String(length=100),
    )


def downgrade() -> None:
    op.alter_column(
        "agents",
        "model_name",
        server_default="gpt-4o-mini",
        existing_type=sa.String(length=100),
    )
