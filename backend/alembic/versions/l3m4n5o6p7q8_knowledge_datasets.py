"""knowledge datasets table + dataset_id on document_chunks

Revision ID: l3m4n5o6p7q8
Revises: k2l3m4n5o6p7
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "l3m4n5o6p7q8"
down_revision: Union[str, None] = "k2l3m4n5o6p7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "knowledge_datasets",
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("department", sa.String(64), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug"),
    )
    op.create_index("ix_knowledge_datasets_slug", "knowledge_datasets", ["slug"])
    op.create_index("ix_knowledge_datasets_department", "knowledge_datasets", ["department"])

    op.add_column("document_chunks", sa.Column("dataset_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "fk_document_chunks_dataset_id",
        "document_chunks",
        "knowledge_datasets",
        ["dataset_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_document_chunks_dataset_id", "document_chunks", ["dataset_id"])


def downgrade() -> None:
    op.drop_index("ix_document_chunks_dataset_id", table_name="document_chunks")
    op.drop_constraint("fk_document_chunks_dataset_id", "document_chunks", type_="foreignkey")
    op.drop_column("document_chunks", "dataset_id")
    op.drop_index("ix_knowledge_datasets_department", table_name="knowledge_datasets")
    op.drop_index("ix_knowledge_datasets_slug", table_name="knowledge_datasets")
    op.drop_table("knowledge_datasets")
