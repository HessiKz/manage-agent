"""agent kinds and capabilities

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

agent_kind = postgresql.ENUM(
    "chat", "worker", "file_intake", "supervisor", "custom",
    name="agent_kind",
    create_type=False,
)
agent_link_type = postgresql.ENUM(
    "tool", "supervises", name="agent_link_type", create_type=False
)
agent_kind_create = postgresql.ENUM(
    "chat", "worker", "file_intake", "supervisor", "custom",
    name="agent_kind",
)
agent_link_type_create = postgresql.ENUM("tool", "supervises", name="agent_link_type")


def _enum_exists(conn, name: str) -> bool:
    row = conn.execute(
        sa.text("SELECT 1 FROM pg_type WHERE typname = :n"),
        {"n": name},
    ).fetchone()
    return row is not None


def upgrade() -> None:
    conn = op.get_bind()
    if not _enum_exists(conn, "agent_kind"):
        agent_kind_create.create(conn, checkfirst=False)
    if not _enum_exists(conn, "agent_link_type"):
        agent_link_type_create.create(conn, checkfirst=False)

    insp = sa.inspect(conn)
    agent_cols = {c["name"] for c in insp.get_columns("agents")}

    if "kind" not in agent_cols:
        op.add_column(
            "agents",
            sa.Column("kind", agent_kind, nullable=False, server_default="chat"),
        )
    if "capabilities" not in agent_cols:
        op.add_column(
            "agents",
            sa.Column(
                "capabilities",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default="{}",
            ),
        )
    if "file_policy" not in agent_cols:
        op.add_column(
            "agents",
            sa.Column(
                "file_policy",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default="{}",
            ),
        )
    if "agent_link_policy" not in agent_cols:
        op.add_column(
            "agents",
            sa.Column(
                "agent_link_policy",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default="{}",
            ),
        )

    existing_indexes = {i["name"] for i in insp.get_indexes("agents")}
    if "ix_agents_kind" not in existing_indexes:
        op.create_index("ix_agents_kind", "agents", ["kind"])

    op.execute(
        sa.text(
            "UPDATE agents SET capabilities = '{\"chat_enabled\": true}'::jsonb "
            "WHERE capabilities = '{}'::jsonb OR capabilities IS NULL"
        )
    )

    tables = set(insp.get_table_names())
    if "agent_actions" not in tables:
        op.create_table(
            "agent_actions",
            sa.Column("agent_id", sa.UUID(), nullable=False),
            sa.Column("slug", sa.String(length=100), nullable=False),
            sa.Column("label", sa.String(length=255), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("icon", sa.String(length=50), nullable=True),
            sa.Column(
                "input_schema",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default="{}",
            ),
            sa.Column("prompt_template", sa.Text(), nullable=False),
            sa.Column("tool_chain", postgresql.ARRAY(sa.String()), nullable=False, server_default="{}"),
            sa.Column("confirmation_required", sa.Boolean(), nullable=False, server_default="false"),
            sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.ForeignKeyConstraint(["agent_id"], ["agents.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("agent_id", "slug", name="uq_agent_action_slug"),
        )
        op.create_index("ix_agent_actions_agent_id", "agent_actions", ["agent_id"])

    if "agent_prompt_templates" not in tables:
        op.create_table(
            "agent_prompt_templates",
            sa.Column("agent_id", sa.UUID(), nullable=False),
            sa.Column("slug", sa.String(length=100), nullable=False),
            sa.Column("label", sa.String(length=255), nullable=False),
            sa.Column("body", sa.Text(), nullable=False),
            sa.Column(
                "variables",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default="{}",
            ),
            sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.ForeignKeyConstraint(["agent_id"], ["agents.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("agent_id", "slug", name="uq_agent_template_slug"),
        )
        op.create_index("ix_agent_prompt_templates_agent_id", "agent_prompt_templates", ["agent_id"])

    if "agent_links" not in tables:
        op.create_table(
            "agent_links",
            sa.Column("caller_agent_id", sa.UUID(), nullable=False),
            sa.Column("callee_agent_id", sa.UUID(), nullable=False),
            sa.Column("link_type", agent_link_type, nullable=False),
            sa.Column("requires_user_permission", sa.Boolean(), nullable=False, server_default="true"),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("id", sa.UUID(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.CheckConstraint("caller_agent_id <> callee_agent_id", name="ck_agent_link_no_self"),
            sa.ForeignKeyConstraint(["caller_agent_id"], ["agents.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["callee_agent_id"], ["agents.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("caller_agent_id", "callee_agent_id", "link_type", name="uq_agent_link"),
        )
        op.create_index("ix_agent_links_caller_agent_id", "agent_links", ["caller_agent_id"])
        op.create_index("ix_agent_links_callee_agent_id", "agent_links", ["callee_agent_id"])


def downgrade() -> None:
    op.drop_index("ix_agent_links_callee_agent_id", table_name="agent_links")
    op.drop_index("ix_agent_links_caller_agent_id", table_name="agent_links")
    op.drop_table("agent_links")
    op.drop_index("ix_agent_prompt_templates_agent_id", table_name="agent_prompt_templates")
    op.drop_table("agent_prompt_templates")
    op.drop_index("ix_agent_actions_agent_id", table_name="agent_actions")
    op.drop_table("agent_actions")
    op.drop_index("ix_agents_kind", table_name="agents")
    op.drop_column("agents", "agent_link_policy")
    op.drop_column("agents", "file_policy")
    op.drop_column("agents", "capabilities")
    op.drop_column("agents", "kind")
    op.execute("DROP TYPE IF EXISTS agent_link_type")
    op.execute("DROP TYPE IF EXISTS agent_kind")
