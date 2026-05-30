"""Map legacy agent kinds to four canonical kinds (capabilities unchanged).

Revision ID: h9i0j1k2l3m4
Revises: g8h9i0j1k2l3
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "h9i0j1k2l3m4"
down_revision: Union[str, None] = "g8h9i0j1k2l3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("UPDATE agents SET kind = 'worker' WHERE kind = 'file_intake'"))
    op.execute(sa.text("UPDATE agents SET kind = 'chat' WHERE kind = 'api'"))
    op.execute(sa.text("UPDATE agents SET kind = 'worker' WHERE kind = 'spreadsheet'"))


def downgrade() -> None:
    pass
