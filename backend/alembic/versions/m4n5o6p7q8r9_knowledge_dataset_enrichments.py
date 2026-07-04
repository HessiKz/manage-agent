"""Add source_type and example fields to knowledge datasets."""

from alembic import op
import sqlalchemy as sa

revision = "m4n5o6p7q8r9"
down_revision = "l3m4n5o6p7q8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "knowledge_datasets",
        sa.Column("source_type", sa.String(length=16), nullable=False, server_default="text"),
    )
    op.add_column(
        "knowledge_datasets",
        sa.Column("example_input", sa.Text(), nullable=True),
    )
    op.add_column(
        "knowledge_datasets",
        sa.Column("example_output", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("knowledge_datasets", "example_output")
    op.drop_column("knowledge_datasets", "example_input")
    op.drop_column("knowledge_datasets", "source_type")
