"""Add phone and address to users."""

from alembic import op
import sqlalchemy as sa

revision = "n5o6p7q8r9s0"
down_revision = "m4n5o6p7q8r9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("phone", sa.String(length=32), nullable=True))
    op.add_column("users", sa.Column("address", sa.String(length=512), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "address")
    op.drop_column("users", "phone")
