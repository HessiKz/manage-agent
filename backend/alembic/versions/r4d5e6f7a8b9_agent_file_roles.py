"""agent_files.role and pair_id (nullable, backfill from filename)

Revision ID: r4d5e6f7a8b9
Revises: q3c4d5e6f7a8
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "r4d5e6f7a8b9"
down_revision: Union[str, None] = "q3c4d5e6f7a8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("agent_files", sa.Column("role", sa.String(length=32), nullable=True))
    op.add_column("agent_files", sa.Column("pair_id", sa.String(length=64), nullable=True))
    op.create_index("ix_agent_files_role", "agent_files", ["role"])
    # Backfill from filename prefixes (same rules as agent_file_roles).
    conn = op.get_bind()
    conn.execute(
        sa.text(
            """
            UPDATE agent_files
            SET role = CASE
                WHEN filename LIKE 'instruction\\_\\_%' ESCAPE '\\'
                     OR filename LIKE '%instruction\\_\\_%' ESCAPE '\\' THEN 'instruction'
                WHEN filename LIKE 'output-sample\\_\\_%' ESCAPE '\\'
                     OR filename LIKE '%output-sample\\_\\_%' ESCAPE '\\' THEN 'output_sample'
                WHEN filename LIKE 'input-sample\\_\\_%' ESCAPE '\\'
                     OR filename LIKE '%input-sample\\_\\_%' ESCAPE '\\' THEN 'input_sample'
                ELSE 'runtime'
            END
            WHERE role IS NULL
            """
        )
    )


def downgrade() -> None:
    op.drop_index("ix_agent_files_role", table_name="agent_files")
    op.drop_column("agent_files", "pair_id")
    op.drop_column("agent_files", "role")
