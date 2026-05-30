"""Add agent_kind value: spreadsheet

Revision ID: g8h9i0j1k2l3
Revises: f7a8b9c0d1e2
Create Date: 2026-05-25

"""

from alembic import op

revision = "g8h9i0j1k2l3"
down_revision = "f7a8b9c0d1e2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE agent_kind ADD VALUE IF NOT EXISTS 'spreadsheet'")


def downgrade() -> None:
    pass
