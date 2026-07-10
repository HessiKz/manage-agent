"""Add preferences_json to users + seed default support autonomy level.

Revision ID: p7q8r9s0t1u2
Revises: o6p7q8r9s0t1
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "p7q8r9s0t1u2"
down_revision: Union[str, None] = "o6p7q8r9s0t1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

AUTONOMY_DEFAULT_KEY = "default_support_autonomy_level"


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "preferences_json",
            sa.JSON(),
            server_default="{}",
            nullable=False,
        ),
    )
    # Seed the org-wide default support autonomy level (plan M3.1 org default).
    op.execute(
        sa.text(
            "INSERT INTO platform_settings (id, key, value, created_at, updated_at) "
            "VALUES (gen_random_uuid(), :key, '{\"level\": 1}'::jsonb, now(), now()) "
            "ON CONFLICT (key) DO NOTHING"
        ).bindparams(key=AUTONOMY_DEFAULT_KEY)
    )


def downgrade() -> None:
    op.execute(
        sa.text("DELETE FROM platform_settings WHERE key = :key").bindparams(
            key=AUTONOMY_DEFAULT_KEY
        )
    )
    op.drop_column("users", "preferences_json")
