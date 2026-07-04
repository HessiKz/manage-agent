"""Set default LLM model to claude-opus-4-8.

Revision ID: k2l3m4n5o6p7
Revises: j1k2l3m4n5o6
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "k2l3m4n5o6p7"
down_revision: Union[str, None] = "j1k2l3m4n5o6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("UPDATE agents SET model_provider = 'openai', model_name = 'claude-opus-4-8'"))
    op.alter_column(
        "agents",
        "model_name",
        server_default="claude-opus-4-8",
        existing_type=sa.String(length=100),
    )


def downgrade() -> None:
    op.execute(sa.text("UPDATE agents SET model_name = 'claude-opus-4-7'"))
    op.alter_column(
        "agents",
        "model_name",
        server_default="claude-opus-4-7",
        existing_type=sa.String(length=100),
    )
